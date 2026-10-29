-- Eventlänk för kunden (offerter, program, checklistor, dokument), dokument per evenemang,
-- evenemangsinformation för personal (utan ekonomi) och e-postavsändare.

-- ---------------------------------------------------------------------------
-- Eventlänk
-- ---------------------------------------------------------------------------
alter table events add column share_token uuid not null unique default gen_random_uuid();
alter table events add column portal_enabled boolean not null default false;  -- öppna länken innan evenemanget är bekräftat
alter table events add column drive_folder_id text;                           -- projektmapp i Google Drive (när det är kopplat)

-- Checklistor: saker som ska vara klara före evenemanget, för oss eller kunden.
create table event_checklist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  title text not null,
  note text,
  due_date date,
  customer_visible boolean not null default true,
  customer_can_check boolean not null default true,
  done_at timestamptz,
  done_by text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on event_checklist (event_id);
alter table event_checklist enable row level security;
create policy "läs" on event_checklist for select to authenticated using (is_member());
create policy "bokare skriver" on event_checklist for all to authenticated using (can_book() or can_manage_staff()) with check (can_book() or can_manage_staff());
grant select, insert, update, delete on event_checklist to authenticated;
revoke all on event_checklist from anon;

-- Standardpunkter: en per rad, "dagar före|text", t.ex. "14|Slutligt antal gäster".
insert into app_settings (key, value) values
  ('checklist_default', E'30|Program och tidsplan klar\n21|Teknikbehov skickat till oss\n14|Slutligt antal gäster\n14|Specialkost och allergier\n7|Kontaktperson på plats under dagen\n3|Material och leveranser bokade'),
  ('mail_from', 'FCC Bokning <bokning@mail.filadelfiacc.se>'),
  ('mail_reply_to', '')
on conflict (key) do nothing;

-- Dokument per evenemang. Lagras i Supabase Storage nu; drive_file_id när Google Drive är kopplat.
create table event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  storage_path text unique,
  drive_file_id text,
  url text,
  mime text,
  size_bytes bigint,
  public boolean not null default false,   -- syns på kundens eventlänk
  staff boolean not null default true,     -- syns för personal på evenemanget
  uploaded_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on event_documents (event_id);
alter table event_documents enable row level security;
create policy "läs" on event_documents for select to authenticated using (is_member());
create policy "bokare skriver" on event_documents for all to authenticated using (can_book() or can_manage_staff()) with check (can_book() or can_manage_staff());
grant select, insert, update, delete on event_documents to authenticated;
revoke all on event_documents from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('dokument', 'dokument', false, 52428800)
on conflict (id) do nothing;
create policy "medlemmar läser dokument" on storage.objects for select to authenticated
  using (bucket_id = 'dokument' and public.is_member());
create policy "bokare laddar upp dokument" on storage.objects for insert to authenticated
  with check (bucket_id = 'dokument' and (public.can_book() or public.can_manage_staff()));
create policy "bokare tar bort dokument" on storage.objects for delete to authenticated
  using (bucket_id = 'dokument' and (public.can_book() or public.can_manage_staff()));

-- Delade dokument (publika för kund eller för personal) kan hämtas med en kortlivad länk av den som fått sökvägen
-- från document_for_link/document_for_staff. Sökvägarna innehåller ett slumpat id.
create function document_shared(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_documents where storage_path = p_name and (public or staff))
$$;
grant execute on function document_shared(text) to anon, authenticated;
create policy "delade dokument" on storage.objects for select to anon, authenticated
  using (bucket_id = 'dokument' and public.document_shared(name));

-- Hämtar ett dokument för eventlänken eller personalen: kontrollerar behörighet, returnerar sökvägen.
create function document_for_link(p_token uuid, p_doc uuid) returns text
language sql stable security definer set search_path = public as $$
  select d.storage_path
  from event_documents d
  where d.id = p_doc
    and (
      -- kundens eventlänk: publika dokument
      (d.public and exists (select 1 from events e where e.id = d.event_id and e.share_token = p_token))
      -- frilans/leverantör: personaldokument för evenemang där de har ett pass
      or (d.staff and exists (
        select 1 from staff st join shift_assignments a on a.staff_id = st.id join shifts sh on sh.id = a.shift_id
        where st.link_token = p_token and st.active and sh.event_id = d.event_id and a.status::text in ('tilldelad', 'inbjuden')
      ))
    )
$$;
-- Internpersonal (inloggad): personaldokument för evenemang där de har ett pass.
create function document_for_staff(p_doc uuid) returns text
language sql stable security definer set search_path = public as $$
  select d.storage_path
  from event_documents d
  where d.id = p_doc and d.staff
    and exists (
      select 1 from shift_assignments a join shifts sh on sh.id = a.shift_id
      where a.staff_id = my_staff_id() and sh.event_id = d.event_id and a.status::text in ('tilldelad', 'ansokt')
    )
$$;
revoke execute on function document_for_link(uuid, uuid), document_for_staff(uuid) from public;
grant execute on function document_for_link(uuid, uuid) to anon, authenticated;
grant execute on function document_for_staff(uuid) to authenticated;

-- Kundens eventlänk: allt utom interna anteckningar och kostnader.
create function event_portal(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'status', e.status,
    'participants', e.participants,
    'description', e.description,
    'technical_info', e.technical_info,
    'hospitality_info', e.hospitality_info,
    'company_name', c.name,
    'contact_name', ct.name,
    'responsible_name', p.full_name,
    'responsible_email', p.email,
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings where key like 'company\_%' or key like 'look\_%'),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', q.number, 'title', q.title, 'status', q.status, 'share_token', q.share_token,
        'sent_at', q.sent_at, 'accepted_at', q.accepted_at, 'valid_until', q.valid_until,
        'total_ex_vat', (select coalesce(sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2)), 0) from quote_lines l where l.quote_id = q.id and l.kind = 'ingar')
      ) order by q.number desc)
      from quotes q where q.event_id = e.id and q.status in ('skickad', 'accepterad', 'avbojd')
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'title', k.title, 'note', k.note, 'due_date', k.due_date,
        'can_check', k.customer_can_check, 'done_at', k.done_at, 'done_by', k.done_by
      ) order by k.due_date nulls last, k.sort_order)
      from event_checklist k where k.event_id = e.id and k.customer_visible
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'mime', d.mime, 'size', d.size_bytes, 'url', d.url, 'created_at', d.created_at) order by d.created_at desc)
      from event_documents d where d.event_id = e.id and d.public
    ), '[]'::jsonb)
  )
  from events e
  left join companies c on c.id = e.company_id
  left join contacts ct on ct.id = e.contact_id
  left join profiles p on p.id = e.responsible_id
  where e.share_token = p_token
    and (e.portal_enabled or e.status in ('bekraftad', 'genomford'))
$$;

-- Kunden bockar av en punkt på checklistan.
create function event_portal_check(p_token uuid, p_item uuid, p_done boolean, p_name text) returns text
language plpgsql security definer set search_path = public as $$
begin
  update event_checklist k
  set done_at = case when p_done then now() end,
      done_by = case when p_done then nullif(trim(coalesce(p_name, '')), '') end
  from events e
  where k.id = p_item and k.event_id = e.id and e.share_token = p_token
    and (e.portal_enabled or e.status in ('bekraftad', 'genomford'))
    and k.customer_visible and k.customer_can_check;
  return case when found then 'ok' else 'ej_tillatet' end;
end $$;

revoke execute on function event_portal(uuid), event_portal_check(uuid, uuid, boolean, text) from public;
grant execute on function event_portal(uuid), event_portal_check(uuid, uuid, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Evenemangsinformation för personal: program, teknik, mat, ansvarig och personaldokument. Ingen ekonomi.
-- ---------------------------------------------------------------------------
create function event_staff_info(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', e.title,
    'participants', e.participants,
    'description', e.description,
    'technical_info', e.technical_info,
    'hospitality_info', e.hospitality_info,
    'responsible_name', p.full_name,
    'responsible_email', p.email,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'url', d.url) order by d.created_at desc)
      from event_documents d where d.event_id = e.id and d.staff
    ), '[]'::jsonb)
  )
  from events e left join profiles p on p.id = e.responsible_id
  where e.id = p_event
$$;
revoke execute on function event_staff_info(uuid) from public, anon, authenticated;

-- Portalen (internpersonal): pass med evenemangsinformation för pass man har sökt eller fått.
create or replace function portal_shifts() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select my_staff_id() as id)
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', sh.id,
      'starts_at', sh.starts_at,
      'ends_at', sh.ends_at,
      'function', f.name,
      'color', f.color,
      'title', sh.title,
      'note', sh.note,
      'event', e.title,
      'room', r.name,
      'needed', sh.needed,
      'filled', (select count(*) from shift_assignments x where x.shift_id = sh.id and x.status = 'tilldelad'),
      'my_status', a.status,
      'open', sh.status = 'oppen',
      'actual_start', a.actual_start,
      'actual_end', a.actual_end,
      'break_minutes', a.break_minutes,
      'report_comment', a.report_comment,
      'attest_status', a.attest_status,
      'attest_comment', a.attest_comment,
      'locked', is_month_locked(sh.starts_at),
      'event_info', case when sh.event_id is not null and a.status::text in ('tilldelad', 'ansokt') then event_staff_info(sh.event_id) end
    ) as x
    from shifts sh
    join staff_functions f on f.id = sh.function_id
    left join events e on e.id = sh.event_id
    left join rooms r on r.id = sh.room_id
    left join shift_assignments a on a.shift_id = sh.id and a.staff_id = (select id from me)
    where (select id from me) is not null
      and (
        a.id is not null
        or (
          sh.status = 'oppen' and sh.staff_kind = 'intern' and sh.ends_at > now()
          and exists (select 1 from staff_skills k where k.staff_id = (select id from me) and k.function_id = sh.function_id)
        )
      )
  ) s
$$;

-- Personliga länken (frilans/leverantör): samma evenemangsinformation.
create or replace function link_shifts(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', st.name,
    'company', st.company,
    'kind', st.kind,
    'shifts', coalesce((
      select jsonb_agg(x order by x ->> 'starts_at')
      from (
        select jsonb_build_object(
          'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at,
          'function', f.name, 'color', f.color, 'title', sh.title, 'note', sh.note,
          'event', e.title, 'room', r.name, 'needed', sh.needed,
          'status', a.status,
          'respond_by', a.respond_by,
          'actual_start', a.actual_start, 'actual_end', a.actual_end, 'break_minutes', a.break_minutes,
          'report_comment', a.report_comment, 'attest_status', a.attest_status, 'attest_comment', a.attest_comment,
          'locked', is_month_locked(sh.starts_at),
          'event_info', case when sh.event_id is not null then event_staff_info(sh.event_id) end
        ) as x
        from shift_assignments a
        join shifts sh on sh.id = a.shift_id
        join staff_functions f on f.id = sh.function_id
        left join events e on e.id = sh.event_id
        left join rooms r on r.id = sh.room_id
        where a.staff_id = st.id
          and sh.status <> 'utkast'
          and sh.ends_at > now() - interval '60 days'
          and a.status::text in ('tilldelad', 'inbjuden')
      ) s
    ), '[]'::jsonb)
  )
  from staff st
  where st.link_token = p_token and st.active and st.kind in ('frilans', 'leverantor')
$$;

-- ---------------------------------------------------------------------------
-- E-post: bilagor och svarsadress i kön, och ett jobb som anropar avsändaren varje minut.
-- ---------------------------------------------------------------------------
alter table email_outbox drop constraint email_outbox_status_check;
alter table email_outbox add constraint email_outbox_status_check check (status in ('koad', 'skickas', 'skickad', 'fel', 'struken'));
alter table email_outbox add column reply_to text;
alter table email_outbox add column attachment_path text;   -- i hinken "underlag"
alter table email_outbox add column attachment_name text;
alter table email_outbox add column event_id uuid references events (id) on delete set null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('underlag', 'underlag', false, 20971520)
on conflict (id) do nothing;
create policy "planerare laddar upp underlag" on storage.objects for insert to authenticated
  with check (bucket_id = 'underlag' and public.can_manage_staff());
create policy "planerare läser underlag" on storage.objects for select to authenticated
  using (bucket_id = 'underlag' and public.can_manage_staff());

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension if not exists pg_net;
    perform cron.schedule(
      'fcc-send-mail', '* * * * *',
      $job$select net.http_post(url := 'https://mvqscjetsllcpfqglhxs.supabase.co/functions/v1/send-mail', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb)
           where exists (select 1 from public.email_outbox where status = 'koad')$job$
    );
  end if;
end $$;

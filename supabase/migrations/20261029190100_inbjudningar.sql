-- Steg C: inbjudningskedja för frilans, bekräftelse för leverantörer, svar och tidrapport via personlig länk,
-- och en e-postkö som skickas när e-post är kopplat.

alter table shifts add column respond_hours int not null default 24 check (respond_hours between 1 and 336);

-- ---------------------------------------------------------------------------
-- E-postkö. Rader läggs här av databasen och appen; en sändare (senare) skickar dem.
-- ---------------------------------------------------------------------------
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  to_name text,
  subject text not null,
  body text not null,
  link text,
  kind text not null default 'ovrigt',
  shift_id uuid references shifts (id) on delete set null,
  staff_id uuid references staff (id) on delete set null,
  status text not null default 'koad' check (status in ('koad', 'skickad', 'fel', 'struken')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on email_outbox (status, created_at);
alter table email_outbox enable row level security;
create policy "läs" on email_outbox for select to authenticated using (is_member());
create policy "planerare skriver" on email_outbox for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on email_outbox to authenticated;
revoke all on email_outbox from anon;

-- Adressen som länkarna i mejlen pekar på.
insert into app_settings (key, value) values ('site_url', 'https://fcc-bokning.vercel.app') on conflict (key) do nothing;

-- Svensk tidsformatering för mejltexter: "fre 12 dec 17:00–23:00".
create function shift_when(sh shifts) returns text
language sql stable set search_path = public as $$
  select (array['mån','tis','ons','tor','fre','lör','sön'])[extract(isodow from sh.starts_at at time zone 'Europe/Stockholm')::int]
    || ' ' || extract(day from sh.starts_at at time zone 'Europe/Stockholm')::int
    || ' ' || (array['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'])[extract(month from sh.starts_at at time zone 'Europe/Stockholm')::int]
    || ' ' || to_char(sh.starts_at at time zone 'Europe/Stockholm', 'HH24:MI') || '–' || to_char(sh.ends_at at time zone 'Europe/Stockholm', 'HH24:MI')
$$;

-- ---------------------------------------------------------------------------
-- Kedjan: löp ut obesvarade inbjudningar och bjud in nästa på tur tills passet är fullt.
-- Anropas efter varje ändring och av ett schemalagt jobb var femte minut.
-- ---------------------------------------------------------------------------
create function advance_invites(p_shift uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  sh shifts;
  open_slots int;
  nxt record;
  invited int := 0;
  site text := coalesce((select value from app_settings where key = 'site_url'), '');
  fname text;
  ev text;
begin
  if auth.uid() is not null and not can_manage_staff() and p_shift is null then
    raise exception 'Ingen behörighet';
  end if;

  -- Obesvarade inbjudningar med passerad svarstid.
  update shift_assignments a set status = 'utgangen', decided_at = now()
  where a.status::text = 'inbjuden' and a.respond_by is not null and a.respond_by < now()
    and (p_shift is null or a.shift_id = p_shift);

  for sh in
    select * from shifts s
    where s.staff_kind = 'frilans' and s.status = 'oppen' and s.starts_at > now()
      and (p_shift is null or s.id = p_shift)
      and exists (select 1 from shift_assignments q where q.shift_id = s.id and q.status::text = 'vantar')
  loop
    select sh.needed - count(*) filter (where status::text in ('tilldelad', 'inbjuden')) into open_slots
    from shift_assignments where shift_id = sh.id;
    select name into fname from staff_functions where id = sh.function_id;
    select title into ev from events where id = sh.event_id;

    while open_slots > 0 loop
      select a.id, a.staff_id, st.email, st.name, st.link_token into nxt
      from shift_assignments a join staff st on st.id = a.staff_id
      where a.shift_id = sh.id and a.status::text = 'vantar' and st.active
      order by a.invite_order nulls last, a.applied_at
      limit 1;
      exit when nxt.id is null;

      update shift_assignments
      set status = 'inbjuden', invited_at = now(),
          respond_by = least(now() + make_interval(hours => sh.respond_hours), sh.starts_at)
      where id = nxt.id;

      if coalesce(nxt.email, '') <> '' then
        insert into email_outbox (to_email, to_name, subject, body, link, kind, shift_id, staff_id)
        values (
          nxt.email, nxt.name,
          'Förfrågan: ' || fname || ' ' || shift_when(sh),
          'Hej ' || split_part(nxt.name, ' ', 1) || E'!\n\nVi undrar om du kan jobba som ' || lower(fname) || ' ' || shift_when(sh)
            || coalesce(E' på ' || ev, '') || E'.\n\nSvara senast '
            || to_char(least(now() + make_interval(hours => sh.respond_hours), sh.starts_at) at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI')
            || E' via länken nedan. Svarar du inte går frågan vidare till nästa person.\n\nFiladelfia Convention Center',
          site || '/pass/' || nxt.link_token, 'inbjudan', sh.id, nxt.staff_id
        );
      end if;
      invited := invited + 1;
      open_slots := open_slots - 1;
    end loop;
  end loop;
  return invited;
end $$;
revoke execute on function advance_invites(uuid) from public, anon;
grant execute on function advance_invites(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Personlig länk: svara på en inbjudan, bekräfta en leverantörsbokning och rapportera tid.
-- ---------------------------------------------------------------------------
create function link_staff(p_token uuid) returns staff
language sql stable security definer set search_path = public as $$
  select * from staff where link_token = p_token and active and kind in ('frilans', 'leverantor')
$$;

create function link_respond(p_token uuid, p_shift uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  st staff := link_staff(p_token);
  a shift_assignments;
  sh shifts;
  taken int;
begin
  if st.id is null then return 'ogiltig'; end if;
  select * into a from shift_assignments where shift_id = p_shift and staff_id = st.id;
  select * into sh from shifts where id = p_shift;
  if a.id is null or a.status::text <> 'inbjuden' then return 'ej_inbjuden'; end if;
  if a.respond_by is not null and a.respond_by < now() then
    update shift_assignments set status = 'utgangen' where id = a.id;
    perform advance_invites(p_shift);
    return 'for_sent';
  end if;
  if p_accept then
    select count(*) into taken from shift_assignments where shift_id = p_shift and status::text = 'tilldelad';
    if taken >= sh.needed and sh.staff_kind <> 'leverantor' then
      update shift_assignments set status = 'avbojd', decided_at = now() where id = a.id;
      return 'fullt';
    end if;
    update shift_assignments set status = 'tilldelad', decided_at = now() where id = a.id;
  else
    update shift_assignments set status = 'avbojd', decided_at = now() where id = a.id;
  end if;
  perform advance_invites(p_shift);
  return 'ok';
end $$;

create function link_report_time(p_token uuid, p_shift uuid, p_start timestamptz, p_end timestamptz, p_break int, p_comment text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  st staff := link_staff(p_token);
  a shift_assignments;
  sh shifts;
begin
  if st.id is null then return 'ogiltig'; end if;
  select * into a from shift_assignments where shift_id = p_shift and staff_id = st.id;
  select * into sh from shifts where id = p_shift;
  if a.id is null or a.status::text <> 'tilldelad' then return 'ej_tilldelad'; end if;
  if sh.starts_at > now() + interval '2 hours' then return 'for_tidigt'; end if;
  if a.attest_status = 'attesterad' then return 'attesterad'; end if;
  if is_month_locked(sh.starts_at) then return 'last'; end if;
  if p_end <= p_start or p_end - p_start > interval '24 hours' then return 'ogiltig_tid'; end if;
  if coalesce(p_break, 0) < 0 or coalesce(p_break, 0) * interval '1 minute' >= p_end - p_start then return 'ogiltig_rast'; end if;
  update shift_assignments
  set actual_start = p_start, actual_end = p_end, break_minutes = coalesce(p_break, 0),
      report_comment = nullif(trim(coalesce(p_comment, '')), ''), reported_at = now(), attest_status = 'rapporterad', attest_comment = null
  where id = a.id;
  return 'ok';
end $$;

-- Länksidans innehåll, nu med svarstid och tidrapport.
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
          'locked', is_month_locked(sh.starts_at)
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

revoke execute on function link_staff(uuid), link_respond(uuid, uuid, boolean), link_report_time(uuid, uuid, timestamptz, timestamptz, int, text) from public;
grant execute on function link_respond(uuid, uuid, boolean), link_report_time(uuid, uuid, timestamptz, timestamptz, int, text) to anon, authenticated;
revoke execute on function link_staff(uuid) from anon, authenticated;
revoke execute on function shift_when(shifts) from public, anon;

-- ---------------------------------------------------------------------------
-- Leverantörspass: leverantören får automatiskt en bokning att bekräfta (och ett mejl i kön).
-- ---------------------------------------------------------------------------
create function supplier_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st staff;
  site text := coalesce((select value from app_settings where key = 'site_url'), '');
  fname text;
begin
  if new.staff_kind <> 'leverantor' or new.supplier_id is null or new.status = 'utkast' then return new; end if;
  if tg_op = 'UPDATE' and old.supplier_id is not distinct from new.supplier_id and old.status <> 'utkast' then return new; end if;
  select * into st from staff where id = new.supplier_id;
  if st.id is null then return new; end if;
  insert into shift_assignments (shift_id, staff_id, status, invited_at)
  values (new.id, st.id, 'inbjuden', now())
  on conflict (shift_id, staff_id) do nothing;
  select name into fname from staff_functions where id = new.function_id;
  if coalesce(st.email, '') <> '' then
    insert into email_outbox (to_email, to_name, subject, body, link, kind, shift_id, staff_id)
    values (
      st.email, st.name, 'Ny bokning: ' || fname || ' ' || shift_when(new),
      'Hej ' || split_part(st.name, ' ', 1) || E'!\n\nVi har bokat ' || new.needed || ' ' || lower(fname) || ' ' || shift_when(new)
        || E'. Bekräfta bokningen via länken nedan, där ser du också alla era bokningar.\n\nFiladelfia Convention Center',
      site || '/pass/' || st.link_token, 'leverantor', new.id, st.id
    );
  end if;
  return new;
end $$;
create trigger shifts_supplier after insert or update of supplier_id, status on shifts
  for each row execute function supplier_assignment();
revoke execute on function supplier_assignment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schemalagt jobb var femte minut (där pg_cron finns).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fcc-advance-invites', '*/5 * * * *', 'select public.advance_invites(null)');
  end if;
end $$;

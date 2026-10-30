-- Lokalkort med QR-kod och felanmälan.
-- En QR-skylt i varje lokal leder till /lokal/<token>: praktisk info (ljus, ljud, el, nödutgångar, kapacitet, vem man ringer).
-- Därifrån kan vem som helst som står i lokalen felanmäla med foto. Ansvariga får en notis.
-- En lokal kan spärras (t.ex. vid ett fel). Spärrade lokaler syns i kalendern och föreslås inte som lediga.

alter table rooms add column card_token uuid not null default gen_random_uuid();
create unique index rooms_card_token on rooms (card_token);
alter table rooms add column card_info text;          -- ljus, ljud, el, teknik
alter table rooms add column safety_info text;        -- nödutgångar, brandsläckare, återsamlingsplats
alter table rooms add column contact_info text;       -- vem man ringer
alter table rooms add column blocked boolean not null default false;
alter table rooms add column blocked_reason text;

create table room_issues (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text,
  photo_path text,
  reporter_name text,
  reporter_contact text,
  status text not null default 'ny' check (status in ('ny', 'pagaende', 'klar')),
  assignee_id uuid references profiles (id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on room_issues (room_id, status);
alter table room_issues enable row level security;
create policy "läs" on room_issues for select to authenticated using (is_member());
create policy "planerare skriver" on room_issues for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on room_issues to authenticated;
revoke all on room_issues from anon;

-- Foton till felanmälningar. Privat hink; den som anmäler kan bara lägga upp, inte läsa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('felanmalan', 'felanmalan', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- Uppladdning kräver en giltig QR-kod i sökvägen: fel/<lokalens kort-token>/<namn>.
create function room_card_path_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_name ~ '^fel/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and exists (select 1 from rooms where card_token::text = split_part(p_name, '/', 2) and active)
$$;
revoke execute on function room_card_path_ok(text) from public;
grant execute on function room_card_path_ok(text) to anon, authenticated;
create policy "alla laddar upp felfoto" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'felanmalan' and public.room_card_path_ok(name));
create policy "personal läser felfoto" on storage.objects for select to authenticated
  using (bucket_id = 'felanmalan' and public.is_member());

-- Vem som får notiser om fel: valda personer, annars alla admin och produktion.
insert into app_settings (key, value) values ('issue_notify', '') on conflict (key) do nothing;

update profiles set notify_kinds = notify_kinds || '{fel}' where not ('fel' = any (notify_kinds));
alter table profiles alter column notify_kinds set default '{offert,pass,checklista,uppgift,option,fel}';
create or replace function set_my_notify_prefs(p_kinds text[], p_scope text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set
    notify_kinds = array(select k from unnest(coalesce(p_kinds, '{}')) k where k in ('offert', 'pass', 'tid', 'checklista', 'uppgift', 'option', 'fel')),
    notify_scope = case when p_scope = 'alla' then 'alla' else 'mina' end,
    notify_email = coalesce(p_email, false)
  where id = auth.uid()
$$;

-- Lokalkortet (öppet för den som har QR-koden).
create function room_card(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'name', r.name, 'kvm', r.kvm, 'image', r.image_path,
    'card_info', r.card_info, 'safety_info', r.safety_info, 'contact_info', r.contact_info,
    'blocked', r.blocked, 'blocked_reason', r.blocked_reason,
    'parent', (select name from rooms p where p.id = r.parent_id),
    'capacities', coalesce((
      select jsonb_agg(jsonb_build_object('setup', s.name, 'capacity', c.capacity) order by s.sort_order)
      from room_capacities c join setups s on s.id = c.setup_id where c.room_id = r.id
    ), '[]'::jsonb),
    'open_issues', coalesce((
      select jsonb_agg(jsonb_build_object('title', i.title, 'created_at', i.created_at, 'status', i.status) order by i.created_at desc)
      from room_issues i where i.room_id = r.id and i.status <> 'klar'
    ), '[]'::jsonb),
    'company', (select value from app_settings where key = 'company_name')
  )
  from rooms r where r.card_token = p_token and r.active
$$;

create function report_room_issue(p_token uuid, p_title text, p_description text, p_name text, p_contact text, p_photo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r rooms; v_id uuid; p record;
  v_list text := coalesce((select value from app_settings where key = 'issue_notify'), '');
begin
  select * into r from rooms where card_token = p_token and active;
  if r.id is null then return 'saknas'; end if;
  if coalesce(trim(p_title), '') = '' then return 'rubrik'; end if;
  -- Enkel spärr mot upprepade inskick: högst 10 anmälningar per lokal och timme.
  if (select count(*) from room_issues where room_id = r.id and created_at > now() - interval '1 hour') >= 10 then return 'for_manga'; end if;
  insert into room_issues (room_id, title, description, reporter_name, reporter_contact, photo_path)
  values (r.id, left(trim(p_title), 200), nullif(left(trim(coalesce(p_description, '')), 2000), ''),
          nullif(left(trim(coalesce(p_name, '')), 80), ''), nullif(left(trim(coalesce(p_contact, '')), 120), ''),
          case when p_photo like 'fel/' || p_token::text || '/%' then left(p_photo, 200) end)
  returning id into v_id;
  for p in
    select id from profiles
    where active and (
      (v_list <> '' and id::text = any (string_to_array(v_list, ',')))
      or (v_list = '' and role::text in ('admin', 'produktion'))
    )
  loop
    perform notify_person(p.id, 'fel', format('Felanmälan i %s: %s', r.name, left(trim(p_title), 80)),
      coalesce(nullif(trim(coalesce(p_name, '')), '') || ': ', '') || coalesce(left(p_description, 200), ''), '/lokaler/fel#' || v_id, null);
  end loop;
  return 'ok';
end $$;
revoke execute on function room_card(uuid), report_room_issue(uuid, text, text, text, text, text) from public;
grant execute on function room_card(uuid), report_room_issue(uuid, text, text, text, text, text) to anon, authenticated;

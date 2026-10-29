-- Personal: funktioner, personer (intern, frilans, leverantör), pass, ansökningar och tilldelning.
-- Internpersonal loggar in med rollen "personal" och ser bara sin portal (via funktionerna portal_*).

alter type app_role add value if not exists 'personal';

-- Personal får INTE läsa bokningar, kunder, offerter m.m. is_member() styr all sådan läsning.
create or replace function is_member() returns boolean
language sql stable as $$ select coalesce(current_app_role()::text not in ('personal'), false) $$;

-- Får planera pass, godkänna sökande och (senare) attestera tid.
create or replace function can_manage_staff() returns boolean
language sql stable as $$ select coalesce(current_app_role()::text in ('admin', 'bokare', 'produktion'), false) $$;

-- ---------------------------------------------------------------------------
-- Funktioner (Rodd, Garderob, Kiosk …) med standardpris per timme
-- ---------------------------------------------------------------------------
create table staff_functions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#60272b',
  hourly_rate numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  active boolean not null default true,
  sort_order int not null default 0
);

insert into staff_functions (name, color, sort_order) values
  ('Rodd', '#4f6d8a', 1),
  ('Garderob', '#9a6a12', 2),
  ('Kiosk', '#2f6b45', 3),
  ('Biljettscanning', '#7a4a8c', 4),
  ('Värd', '#60272b', 5),
  ('Säkerhetsvärd', '#b3261e', 6),
  ('Städ', '#5b7a7a', 7),
  ('Ljudtekniker', '#2d5f8a', 8),
  ('Ljustekniker', '#a0682a', 9),
  ('Bildtekniker', '#3d6b5a', 10);

-- ---------------------------------------------------------------------------
-- Personer. Intern = anställd med inloggning. Frilans och leverantör får en personlig länk (link_token).
-- ---------------------------------------------------------------------------
create type staff_kind as enum ('intern', 'frilans', 'leverantor');

create table staff (
  id uuid primary key default gen_random_uuid(),
  kind staff_kind not null default 'intern',
  profile_id uuid unique references profiles (id) on delete set null,
  name text not null,
  email text,
  phone text,
  company text,                         -- leverantörens företag
  hourly_rate numeric(10, 2) check (hourly_rate >= 0),  -- null = funktionens pris
  active boolean not null default true,
  note text,
  link_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create unique index staff_email_unique on staff (lower(email)) where email is not null and email <> '';

create table staff_skills (
  staff_id uuid not null references staff (id) on delete cascade,
  function_id uuid not null references staff_functions (id) on delete cascade,
  primary key (staff_id, function_id)
);

-- ---------------------------------------------------------------------------
-- Pass. Kan vara kopplade till ett evenemang (och en lokal), eller fristående.
-- ---------------------------------------------------------------------------
create type shift_status as enum ('utkast', 'oppen', 'stangd');

create table shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events (id) on delete set null,
  room_id uuid references rooms (id) on delete set null,
  function_id uuid not null references staff_functions (id),
  staff_kind staff_kind not null default 'intern',   -- vem passet riktar sig till
  supplier_id uuid references staff (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  needed int not null default 1 check (needed between 1 and 500),
  status shift_status not null default 'oppen',
  title text,
  note text,
  hourly_rate numeric(10, 2) check (hourly_rate >= 0),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on shifts (starts_at);
create index on shifts (event_id);
create trigger shifts_touch before update on shifts for each row execute function touch_updated_at();

create type assignment_status as enum ('ansokt', 'tilldelad', 'nekad', 'aterkallad', 'inbjuden', 'avbojd', 'utgangen');

create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts (id) on delete cascade,
  staff_id uuid not null references staff (id) on delete cascade,
  status assignment_status not null default 'ansokt',
  applied_at timestamptz not null default now(),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  -- Inbjudningskedja (frilans), används i steg C.
  invite_order int,
  invited_at timestamptz,
  respond_by timestamptz,
  -- Tidrapport och attest, används i steg B.
  actual_start timestamptz,
  actual_end timestamptz,
  break_minutes int not null default 0 check (break_minutes between 0 and 600),
  report_comment text,
  reported_at timestamptz,
  attest_status text not null default '' check (attest_status in ('', 'rapporterad', 'attesterad', 'avvisad')),
  attested_by uuid references profiles (id),
  attested_at timestamptz,
  attest_comment text,
  unique (shift_id, staff_id)
);
create index on shift_assignments (staff_id);

-- Historik på pass och tilldelningar.
create trigger audit_shifts after insert or update or delete on shifts for each row execute function log_change();
create trigger audit_shift_assignments after insert or update or delete on shift_assignments for each row execute function log_change();

-- ---------------------------------------------------------------------------
-- Behörigheter. Personal når bara sin egen personpost; allt annat går via portal_*-funktionerna.
-- ---------------------------------------------------------------------------
create function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from staff s join profiles p on p.id = s.profile_id
  where s.profile_id = auth.uid() and s.active and p.active
$$;

alter table staff_functions enable row level security;
alter table staff enable row level security;
alter table staff_skills enable row level security;
alter table shifts enable row level security;
alter table shift_assignments enable row level security;

create policy "läs" on staff_functions for select to authenticated using (is_member() or my_staff_id() is not null);
create policy "planerare skriver" on staff_functions for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
create policy "läs" on staff for select to authenticated using (is_member() or id = my_staff_id());
create policy "planerare skriver" on staff for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
create policy "läs" on staff_skills for select to authenticated using (is_member() or staff_id = my_staff_id());
create policy "planerare skriver" on staff_skills for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
create policy "läs" on shifts for select to authenticated using (is_member());
create policy "planerare skriver" on shifts for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
create policy "läs" on shift_assignments for select to authenticated using (is_member());
create policy "planerare skriver" on shift_assignments for all to authenticated using (can_manage_staff()) with check (can_manage_staff());

grant select, insert, update, delete on staff_functions, staff, staff_skills, shifts, shift_assignments to authenticated;
revoke all on staff_functions, staff, staff_skills, shifts, shift_assignments from anon;

-- ---------------------------------------------------------------------------
-- Portalen för internpersonal
-- ---------------------------------------------------------------------------

-- Lediga pass i mina funktioner, plus alla pass jag har sökt eller fått. Med evenemang och lokal.
create function portal_shifts() returns jsonb
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
      'open', sh.status = 'oppen'
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

-- Ansök till ett öppet pass i en funktion man har. Returnerar 'ok' eller en felkod.
create function portal_apply(p_shift uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_staff_id();
  sh shifts;
  cur assignment_status;
begin
  if me is null then return 'ej_personal'; end if;
  select * into sh from shifts where id = p_shift;
  if sh.id is null or sh.status <> 'oppen' or sh.staff_kind <> 'intern' or sh.ends_at <= now() then return 'stangt'; end if;
  if not exists (select 1 from staff_skills where staff_id = me and function_id = sh.function_id) then return 'fel_funktion'; end if;
  select status into cur from shift_assignments where shift_id = p_shift and staff_id = me;
  if cur in ('tilldelad', 'ansokt') then return 'ok'; end if;
  if cur = 'nekad' then return 'nekad'; end if;
  insert into shift_assignments (shift_id, staff_id, status) values (p_shift, me, 'ansokt')
  on conflict (shift_id, staff_id) do update set status = 'ansokt', applied_at = now(), decided_by = null, decided_at = null;
  return 'ok';
end $$;

-- Dra tillbaka en ansökan (inte ett tilldelat pass – det görs genom att kontakta planeraren).
create function portal_withdraw(p_shift uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := my_staff_id();
begin
  if me is null then return 'ej_personal'; end if;
  update shift_assignments set status = 'aterkallad'
  where shift_id = p_shift and staff_id = me and status = 'ansokt';
  return case when found then 'ok' else 'ej_ansokt' end;
end $$;

revoke execute on function my_staff_id(), portal_shifts(), portal_apply(uuid), portal_withdraw(uuid), can_manage_staff() from public, anon;
grant execute on function my_staff_id(), portal_shifts(), portal_apply(uuid), portal_withdraw(uuid), can_manage_staff() to authenticated;

-- Nya inloggningar vars e-post finns som internpersonal kopplas ihop och får rollen personal.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  select id into s_id from staff where kind = 'intern' and lower(email) = lower(new.email) and profile_id is null limit 1;
  insert into profiles (id, email, full_name, role)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when s_id is not null then 'personal'::app_role else 'lasare'::app_role end
  );
  if s_id is not null then update staff set profile_id = new.id where id = s_id; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Personlig länk för frilans och leverantörer (utan inloggning). Steg C bygger ut med svar på inbjudningar.
-- ---------------------------------------------------------------------------
create function link_shifts(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', st.name,
    'company', st.company,
    'kind', st.kind,
    'shifts', coalesce((
      select jsonb_agg(x order by x ->> 'starts_at')
      from (
        select distinct on (sh.id) jsonb_build_object(
          'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at,
          'function', f.name, 'color', f.color, 'title', sh.title, 'note', sh.note,
          'event', e.title, 'room', r.name, 'needed', sh.needed,
          'status', coalesce(a.status::text, case when sh.supplier_id = st.id then 'leverantor' end)
        ) as x
        from shifts sh
        join staff_functions f on f.id = sh.function_id
        left join events e on e.id = sh.event_id
        left join rooms r on r.id = sh.room_id
        left join shift_assignments a on a.shift_id = sh.id and a.staff_id = st.id
        where sh.ends_at > now() - interval '60 days'
          and sh.status <> 'utkast'
          and (a.status in ('tilldelad', 'inbjuden') or sh.supplier_id = st.id)
      ) s
    ), '[]'::jsonb)
  )
  from staff st
  where st.link_token = p_token and st.active and st.kind in ('frilans', 'leverantor')
$$;
revoke execute on function link_shifts(uuid) from public;
grant execute on function link_shifts(uuid) to anon, authenticated;

-- FCC Bokning: grundschema (fas 1)
-- Lokaler, kunder, evenemang, bokningar per lokal och tidslucka, krockkontroll och behörigheter.

-- ---------------------------------------------------------------------------
-- Användare och roller
-- ---------------------------------------------------------------------------
create type app_role as enum ('admin', 'bokare', 'produktion', 'lasare');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role app_role not null default 'lasare',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Skapar en profil automatiskt när en användare bjuds in i Supabase Auth.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function can_book() returns boolean
language sql stable as $$ select coalesce(current_app_role() in ('admin', 'bokare'), false) $$;

create function is_admin() returns boolean
language sql stable as $$ select coalesce(current_app_role() = 'admin', false) $$;

create function is_member() returns boolean
language sql stable as $$ select current_app_role() is not null $$;

-- ---------------------------------------------------------------------------
-- Lokaler
-- ---------------------------------------------------------------------------
create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  sort_order int not null default 0
);

-- En lokal kan ha en förälder. Bokas föräldern blockeras alla underliggande
-- delar, och bokas en del blockeras föräldern (t.ex. Stora salen, hela ↔ Läktare).
create table rooms (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id),
  parent_id uuid references rooms (id),
  name text not null,
  short_name text,
  kvm numeric,
  kvm_note text,
  note text,
  bookable boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index on rooms (parent_id);

create table setups (
  id text primary key,          -- t.ex. 'bio', 'skol'
  name text not null,
  sort_order int not null default 0
);

create table room_capacities (
  room_id uuid not null references rooms (id) on delete cascade,
  setup_id text not null references setups (id),
  capacity int not null check (capacity > 0),
  primary key (room_id, setup_id)
);

-- Lokalen själv plus alla dess förfäder.
create function room_ancestors(p_room uuid) returns setof uuid
language sql stable as $$
  with recursive up(id, parent_id) as (
    select id, parent_id from rooms where id = p_room
    union all
    select r.id, r.parent_id from rooms r join up on r.id = up.parent_id
  )
  select id from up
$$;

-- Två lokaler krockar om de är samma lokal eller den ena ligger inuti den andra.
create function rooms_overlap(a uuid, b uuid) returns boolean
language sql stable as $$
  select a = b
      or b in (select room_ancestors(a))
      or a in (select room_ancestors(b))
$$;

-- ---------------------------------------------------------------------------
-- Kunder
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_nr text,
  email text,
  phone text,
  invoice_address text,
  invoice_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on companies (lower(name));

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
create index on contacts (company_id);

-- ---------------------------------------------------------------------------
-- Evenemang och bokningar
-- ---------------------------------------------------------------------------
create type event_status as enum ('forfragan', 'preliminar', 'bekraftad', 'genomford', 'avbokad');

create table event_types (
  id text primary key,
  name text not null,
  sort_order int not null default 0
);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status event_status not null default 'forfragan',
  event_type_id text references event_types (id),
  company_id uuid references companies (id) on delete set null,
  contact_id uuid references contacts (id) on delete set null,
  responsible_id uuid references profiles (id) on delete set null,
  participants int check (participants is null or participants >= 0),
  option_expires_on date,          -- sista dag för en preliminär option
  description text,
  technical_info text,
  hospitality_info text,
  internal_notes text,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on events (status);
create index on events (company_id);

-- En bokning = en lokal under en tidslucka inom ett evenemang.
-- Återkommande evenemang (t.ex. Söndagar Filadelfia) har många bokningar.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  room_id uuid not null references rooms (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  setup_id text references setups (id),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on bookings (room_id);
create index on bookings (event_id);
create index on bookings using gist (tstzrange(starts_at, ends_at));

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger events_touch before update on events for each row execute function touch_updated_at();
create trigger companies_touch before update on companies for each row execute function touch_updated_at();

-- Evenemangets tidsspann räknas fram från bokningarna.
create view event_overview with (security_invoker = true) as
select
  e.*,
  c.name as company_name,
  ct.name as contact_name,
  et.name as event_type_name,
  min(b.starts_at) as starts_at,
  max(b.ends_at) as ends_at,
  count(b.id)::int as booking_count
from events e
left join companies c on c.id = e.company_id
left join contacts ct on ct.id = e.contact_id
left join event_types et on et.id = e.event_type_id
left join bookings b on b.event_id = e.id
group by e.id, c.name, ct.name, et.name;

-- Alla krockar mellan aktiva bokningar (avbokade och genomförda räknas inte).
create view booking_conflicts with (security_invoker = true) as
select
  b1.id as booking_id, b1.event_id, e1.title as event_title, e1.status as event_status,
  r1.name as room_name, b1.starts_at, b1.ends_at,
  b2.id as other_booking_id, b2.event_id as other_event_id, e2.title as other_event_title,
  e2.status as other_event_status, r2.name as other_room_name,
  b2.starts_at as other_starts_at, b2.ends_at as other_ends_at
from bookings b1
join events e1 on e1.id = b1.event_id and e1.status in ('forfragan', 'preliminar', 'bekraftad')
join bookings b2 on b2.id <> b1.id
  and tstzrange(b1.starts_at, b1.ends_at) && tstzrange(b2.starts_at, b2.ends_at)
join events e2 on e2.id = b2.event_id and e2.status in ('forfragan', 'preliminar', 'bekraftad')
join rooms r1 on r1.id = b1.room_id
join rooms r2 on r2.id = b2.room_id
where rooms_overlap(b1.room_id, b2.room_id);

-- Kontroll innan man sparar: vilka bokningar krockar med en tänkt bokning?
create function check_conflicts(p_room uuid, p_starts timestamptz, p_ends timestamptz, p_exclude_event uuid default null)
returns table (
  booking_id uuid, event_id uuid, event_title text, event_status event_status,
  room_name text, starts_at timestamptz, ends_at timestamptz
)
language sql stable security invoker as $$
  select b.id, e.id, e.title, e.status, r.name, b.starts_at, b.ends_at
  from bookings b
  join events e on e.id = b.event_id and e.status in ('forfragan', 'preliminar', 'bekraftad')
  join rooms r on r.id = b.room_id
  where tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts, p_ends)
    and (p_exclude_event is null or e.id <> p_exclude_event)
    and rooms_overlap(b.room_id, p_room)
  order by b.starts_at
$$;

-- ---------------------------------------------------------------------------
-- Behörigheter (Row Level Security)
-- Alla aktiva användare läser. Admin och bokare ändrar bokningsdata.
-- Bara admin ändrar lokaler och användare.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table sites enable row level security;
alter table rooms enable row level security;
alter table setups enable row level security;
alter table room_capacities enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table event_types enable row level security;
alter table events enable row level security;
alter table bookings enable row level security;

create policy "läs profiler" on profiles for select to authenticated using (is_member() or id = auth.uid());
create policy "admin ändrar profiler" on profiles for update to authenticated using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['sites', 'rooms', 'setups', 'room_capacities', 'event_types'] loop
    execute format('create policy "läs" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "admin skriver" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
  foreach t in array array['companies', 'contacts', 'events', 'bookings'] loop
    execute format('create policy "läs" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "bokare skriver" on %I for all to authenticated using (can_book()) with check (can_book())', t);
  end loop;
end $$;

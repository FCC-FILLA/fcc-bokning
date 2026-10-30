-- Möbleringsritningar. En ritning ligger på en lokal och är antingen en mall (inget evenemang) eller hör till ett evenemang.
-- Möblerna sparas som jsonb, i meter med mittpunkt och vridning:
--   {id, t (möbeltyp), x, y, r, w, d, shape: 'rect'|'round', chairs, label}
-- Varje objekt bär sina egna mått, så ritningen ser likadan ut även om möbeltypen ändras senare.

-- Möbler och inventarier: storlek och hur många vi har (för varning när en ritning kräver fler än lagret).
create table furniture_types (
  id text primary key,
  name text not null,
  shape text not null default 'rect' check (shape in ('rect', 'round', 'chair', 'fixed')),
  width_m numeric not null check (width_m > 0),
  depth_m numeric not null check (depth_m > 0),
  default_chairs int not null default 0 check (default_chairs >= 0),
  max_chairs int not null default 0 check (max_chairs >= 0),
  stock int check (stock is null or stock >= 0),
  color text,
  sort_order int not null default 0,
  active boolean not null default true
);
alter table furniture_types enable row level security;
create policy "läs" on furniture_types for select to authenticated using (is_member());
create policy "admin skriver" on furniture_types for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on furniture_types to authenticated;
revoke all on furniture_types from anon;

insert into furniture_types (id, name, shape, width_m, depth_m, default_chairs, max_chairs, stock, color, sort_order) values
  ('stol',        'Stol',                 'chair', 0.5,  0.5,  0,  0,  null, null,      1),
  ('rund180',     'Rundbord Ø180',        'round', 1.8,  1.8,  10, 12, null, null,      2),
  ('rund150',     'Rundbord Ø150',        'round', 1.5,  1.5,  8,  10, null, null,      3),
  ('rund120',     'Rundbord Ø120',        'round', 1.2,  1.2,  6,  8,  null, null,      4),
  ('bord180',     'Bord 180×80',          'rect',  1.8,  0.8,  6,  6,  null, null,      5),
  ('bord120',     'Bord 120×80',          'rect',  1.2,  0.8,  4,  4,  null, null,      6),
  ('skolbord',    'Skolbord 180×50',      'rect',  1.8,  0.5,  3,  3,  null, null,      7),
  ('stabord',     'Ståbord Ø70',          'round', 0.7,  0.7,  0,  0,  null, '#d9cfc4', 8),
  ('scen',        'Scenpodie 2×1',        'rect',  2,    1,    0,  0,  null, '#3b3436', 9),
  ('talarstol',   'Talarstol',            'rect',  0.6,  0.5,  0,  0,  null, '#3b3436', 10),
  ('bar',         'Bardisk',              'rect',  2,    0.7,  0,  0,  null, '#8a5a3c', 11),
  ('buffe',       'Buffébord',            'rect',  2.4,  0.8,  0,  0,  null, '#c9a66b', 12),
  ('teknik',      'Teknikbord / FOH',     'rect',  2,    1,    0,  0,  null, '#4b5d73', 13),
  ('skarm',       'Skärm / duk',          'rect',  3,    0.3,  0,  0,  null, '#4b5d73', 14),
  ('garderob',    'Garderobsställning',   'rect',  1.5,  0.6,  0,  0,  null, '#7a6a5a', 15),
  ('pelare',      'Pelare',               'fixed', 0.5,  0.5,  0,  0,  null, '#555',    20),
  ('dorr',        'Dörr',                 'fixed', 1,    0.2,  0,  0,  null, '#2f7d4f', 21),
  ('nodutgang',   'Nödutgång',            'fixed', 1.2,  0.2,  0,  0,  null, '#1f9d55', 22),
  ('fastscen',    'Fast scen',            'fixed', 8,    4,    0,  0,  null, '#3b3436', 23),
  ('vagg',        'Vägg',                 'fixed', 3,    0.15, 0,  0,  null, '#333',    24);

-- Lokalens grundritning: mått och fasta saker (pelare, dörrar, nödutgångar, fast scen).
alter table rooms add column plan jsonb;   -- {width, depth, items: [...]}

create table layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_id uuid not null references rooms (id) on delete cascade,
  setup_id text references setups (id),
  event_id uuid references events (id) on delete cascade,
  booking_id uuid references bookings (id) on delete set null,
  items jsonb not null default '[]',
  notes text,
  staff_visible boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on layouts (event_id);
create index on layouts (room_id);
alter table layouts enable row level security;
create policy "läs" on layouts for select to authenticated using (is_member());
create policy "planerare skriver" on layouts for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on layouts to authenticated;
revoke all on layouts from anon;

create function layouts_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
create trigger layouts_touch before update on layouts for each row execute function layouts_touch();

-- Ställ-lista: antal av varje möbeltyp plus stolar (stolar runt bord räknas in).
create function layout_counts(p_items jsonb) returns jsonb
language sql immutable as $$
  with i as (select x from jsonb_array_elements(coalesce(p_items, '[]')) x),
  per as (
    select x->>'t' as t, count(*) as n from i where x->>'t' is not null and x->>'t' <> 'stol' group by 1
  ),
  chairs as (
    select coalesce(sum(coalesce((x->>'chairs')::int, 0)), 0) + count(*) filter (where x->>'t' = 'stol') as n from i
  )
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) || jsonb_build_object('stol', (select n from chairs)) from per
$$;

-- Personalen får ritningarna för sitt evenemang via passet (bara de som är markerade för personal).
create or replace function event_staff_info(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', e.title,
    'participants', e.participants,
    'description', e.description,
    'technical_info', e.technical_info,
    'hospitality_info', e.hospitality_info,
    'staff_info', e.staff_info,
    'responsible_name', p.full_name,
    'responsible_email', p.email,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'url', d.url) order by d.created_at desc)
      from event_documents d where d.event_id = e.id and d.staff
    ), '[]'::jsonb),
    'layouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'room', r.name, 'notes', l.notes, 'items', l.items, 'plan', r.plan, 'kvm', r.kvm,
        'starts_at', b.starts_at
      ) order by b.starts_at nulls last, l.name)
      from layouts l join rooms r on r.id = l.room_id left join bookings b on b.id = l.booking_id
      where l.event_id = e.id and l.staff_visible
    ), '[]'::jsonb)
  )
  from events e left join profiles p on p.id = e.responsible_id
  where e.id = p_event
$$;

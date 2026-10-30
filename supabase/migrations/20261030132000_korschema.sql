-- Körschema per evenemang: minut för minut (insläpp, tal, paus, middag, riv).
-- Varje punkt kan visas för kunden (eventlänken) och för personalen (pass i portalen och på personliga länkar).
-- En punkt kan knytas till en personalfunktion, så att t.ex. garderoben ser sina delar markerade.

create table run_sheet_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int check (duration_minutes is null or duration_minutes between 0 and 2880),
  title text not null check (length(title) between 1 and 200),
  room_id uuid references rooms (id) on delete set null,
  who text,                                     -- ansvarig, talare, artist …
  function_id uuid references staff_functions (id) on delete set null,
  note text,
  customer_visible boolean not null default true,
  staff_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index on run_sheet_items (event_id, starts_at);
alter table run_sheet_items enable row level security;
create policy "läs" on run_sheet_items for select to authenticated using (is_member());
create policy "planerare skriver" on run_sheet_items for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on run_sheet_items to authenticated;
revoke all on run_sheet_items from anon;

create function run_sheet_json(p_event uuid, p_audience text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'starts_at', i.starts_at, 'duration_minutes', i.duration_minutes, 'title', i.title,
    'room', r.name, 'who', i.who, 'note', i.note,
    'function_id', case when p_audience = 'personal' then i.function_id end,
    'function', case when p_audience = 'personal' then f.name end,
    'color', case when p_audience = 'personal' then f.color end
  ) order by i.starts_at, i.created_at), '[]'::jsonb)
  from run_sheet_items i
  left join rooms r on r.id = i.room_id
  left join staff_functions f on f.id = i.function_id
  where i.event_id = p_event
    and case when p_audience = 'kund' then i.customer_visible else i.staff_visible end
$$;
revoke execute on function run_sheet_json(uuid, text) from public, anon, authenticated;

-- Eventlänken och personalens evenemangsinfo får körschemat. De tidigare versionerna behålls under nya namn
-- och anropas härifrån (så att den här migrationen inte behöver upprepa dem). Ändras de senare ska *_base ändras.
alter function event_portal(uuid) rename to event_portal_base;
revoke execute on function event_portal_base(uuid) from public, anon, authenticated;
create function event_portal(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select b || jsonb_build_object('run_sheet', run_sheet_json((b ->> 'id')::uuid, 'kund'))
  from (select event_portal_base(p_token) as b) x
  where b is not null
$$;
revoke execute on function event_portal(uuid) from public;
grant execute on function event_portal(uuid) to anon, authenticated;

alter function event_staff_info(uuid) rename to event_staff_info_base;
revoke execute on function event_staff_info_base(uuid) from public, anon, authenticated;
create function event_staff_info(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select event_staff_info_base(p_event) || jsonb_build_object('run_sheet', run_sheet_json(p_event, 'personal'))
$$;
revoke execute on function event_staff_info(uuid) from public, anon, authenticated;

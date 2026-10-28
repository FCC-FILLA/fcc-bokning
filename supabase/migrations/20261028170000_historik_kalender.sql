-- Historik över ändringar och personliga kalenderlänkar.

-- ---------------------------------------------------------------------------
-- Historik
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references profiles (id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  event_id uuid,
  quote_id uuid,
  action text not null check (action in ('skapad', 'andrad', 'borttagen')),
  summary text,
  changes jsonb
);
create index on audit_log (event_id, at desc);
create index on audit_log (quote_id, at desc);
create index on audit_log (at desc);

-- Loggar vilka fält som ändrats. Tidsstämplar och interna id:n räknas inte som ändringar.
create function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  diff jsonb := '{}'::jsonb;
  k text;
  v_event uuid;
  v_quote uuid;
  v_summary text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at', 'created_at', 'share_token') and (old_j -> k) is distinct from (new_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('fran', old_j -> k, 'till', new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  if tg_table_name = 'events' then
    v_event := (row_j ->> 'id')::uuid;
    v_summary := row_j ->> 'title';
  elsif tg_table_name = 'bookings' then
    v_event := (row_j ->> 'event_id')::uuid;
    v_summary := (select name from rooms where id = (row_j ->> 'room_id')::uuid);
  elsif tg_table_name = 'quotes' then
    v_quote := (row_j ->> 'id')::uuid;
    v_event := (row_j ->> 'event_id')::uuid;
    v_summary := 'Offert ' || (row_j ->> 'number') || ' ' || (row_j ->> 'title');
  else
    v_summary := row_j ->> 'name';
  end if;

  insert into audit_log (user_id, table_name, record_id, event_id, quote_id, action, summary, changes)
  values (
    auth.uid(),
    tg_table_name,
    (row_j ->> 'id')::uuid,
    v_event,
    v_quote,
    case tg_op when 'INSERT' then 'skapad' when 'UPDATE' then 'andrad' else 'borttagen' end,
    v_summary,
    case when tg_op = 'UPDATE' then diff
         when tg_op = 'INSERT' and tg_table_name = 'bookings' then jsonb_build_object('starts_at', new_j -> 'starts_at', 'ends_at', new_j -> 'ends_at')
         when tg_op = 'DELETE' and tg_table_name = 'bookings' then jsonb_build_object('starts_at', old_j -> 'starts_at', 'ends_at', old_j -> 'ends_at')
    end
  );
  return coalesce(new, old);
end $$;

create trigger audit_events after insert or update or delete on events for each row execute function log_change();
create trigger audit_bookings after insert or update or delete on bookings for each row execute function log_change();
create trigger audit_quotes after insert or update or delete on quotes for each row execute function log_change();
create trigger audit_companies after insert or update or delete on companies for each row execute function log_change();

alter table audit_log enable row level security;
create policy "läs" on audit_log for select to authenticated using (is_member());
grant select on audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Kalenderprenumeration: en hemlig länk per användare
-- ---------------------------------------------------------------------------
create table calendar_tokens (
  user_id uuid primary key references profiles (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  include_unconfirmed boolean not null default true,
  created_at timestamptz not null default now()
);
alter table calendar_tokens enable row level security;
create policy "egen läs" on calendar_tokens for select to authenticated using (user_id = auth.uid());
create policy "egen skapa" on calendar_tokens for insert to authenticated with check (user_id = auth.uid() and is_member());
create policy "egen ändra" on calendar_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "egen ta bort" on calendar_tokens for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on calendar_tokens to authenticated;

-- Bokningar för en kalenderlänk: från en månad bakåt till ett år framåt.
-- Fungerar bara så länge användaren är aktiv.
create function calendar_feed(p_token uuid)
returns table (
  booking_id uuid, event_id uuid, title text, status event_status, room text,
  starts_at timestamptz, ends_at timestamptz, note text, company text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.id, e.id, e.title, e.status, r.name, b.starts_at, b.ends_at, b.note, c.name, greatest(e.updated_at, b.created_at)
  from calendar_tokens t
  join profiles p on p.id = t.user_id and p.active
  join bookings b on true
  join events e on e.id = b.event_id
  join rooms r on r.id = b.room_id
  left join companies c on c.id = e.company_id
  where t.token = p_token
    and b.starts_at > now() - interval '31 days'
    and b.starts_at < now() + interval '366 days'
    and (e.status = 'bekraftad' or (t.include_unconfirmed and e.status in ('forfragan', 'preliminar')))
  order by b.starts_at
  limit 5000
$$;

revoke execute on function log_change() from public, anon, authenticated;
revoke execute on function calendar_feed(uuid) from public;
grant execute on function calendar_feed(uuid) to anon, authenticated;
revoke all on audit_log, calendar_tokens from anon;

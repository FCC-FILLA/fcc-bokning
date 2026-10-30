-- Förfrågningsformulär för hemsidan (/forfragan, kan bäddas in med iframe).
-- Kunden anger datum, tid, gäster och typ. Det blir ett evenemang med status Förfrågan, kunden och kontakten läggs upp
-- (eller hittas på e-post), lediga lokaler som passar föreslås, bokare får en notis och kunden ett kvitto via e-post.

create table inquiries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events (id) on delete set null,
  data jsonb not null,
  suggested jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table inquiries enable row level security;
create policy "läs" on inquiries for select to authenticated using (is_member());
grant select on inquiries to authenticated;
revoke all on inquiries from anon;

update profiles set notify_kinds = notify_kinds || '{forfragan}' where role::text in ('admin', 'bokare') and not ('forfragan' = any (notify_kinds));
alter table profiles alter column notify_kinds set default '{offert,pass,checklista,uppgift,option,fel,forfragan}';
create or replace function set_my_notify_prefs(p_kinds text[], p_scope text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set
    notify_kinds = array(select k from unnest(coalesce(p_kinds, '{}')) k where k in ('offert', 'pass', 'tid', 'checklista', 'uppgift', 'option', 'fel', 'forfragan')),
    notify_scope = case when p_scope = 'alla' then 'alla' else 'mina' end,
    notify_email = coalesce(p_email, false)
  where id = auth.uid()
$$;

-- Val i formuläret.
create function inquiry_options() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order) from event_types), '[]'::jsonb),
    'setups', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order) from setups), '[]'::jsonb)
  )
$$;

-- Lediga lokaler som rymmer gästerna (minsta först), lediga alla dagar i tidsfönstret.
create function suggest_rooms(p_from timestamptz, p_to timestamptz, p_days int, p_guests int, p_setup text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('room_id', x.id, 'name', x.name, 'capacity', x.cap) order by x.cap), '[]'::jsonb)
  from (
    select r.id, r.name,
      (select max(c.capacity) from room_capacities c where c.room_id = r.id and (p_setup is null or c.setup_id = p_setup)) as cap
    from rooms r
    where r.active and r.bookable and not r.blocked
  ) x
  where x.cap is not null and x.cap >= coalesce(p_guests, 0)
    and not exists (
      select 1 from bookings b join events e on e.id = b.event_id and e.status in ('preliminar', 'bekraftad')
      cross join generate_series(0, greatest(coalesce(p_days, 1), 1) - 1) d
      where rooms_overlap(b.room_id, x.id)
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_from + make_interval(days => d), p_to + make_interval(days => d))
    )
  limit 3
$$;
revoke execute on function suggest_rooms(timestamptz, timestamptz, int, int, text) from public, anon;
grant execute on function suggest_rooms(timestamptz, timestamptz, int, int, text) to authenticated;

create function submit_inquiry(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p ->> 'name', '')), 120);
  v_email text := lower(left(trim(coalesce(p ->> 'email', '')), 200));
  v_phone text := nullif(left(trim(coalesce(p ->> 'phone', '')), 40), '');
  v_company text := nullif(left(trim(coalesce(p ->> 'company', '')), 200), '');
  v_title text := nullif(left(trim(coalesce(p ->> 'title', '')), 200), '');
  v_type text := nullif(p ->> 'event_type_id', '');
  v_setup text := nullif(p ->> 'setup_id', '');
  v_guests int := nullif(p ->> 'guests', '')::int;
  v_days int := least(greatest(coalesce(nullif(p ->> 'days', '')::int, 1), 1), 14);
  v_from timestamptz := (p ->> 'starts_at')::timestamptz;
  v_to timestamptz := (p ->> 'ends_at')::timestamptz;
  v_msg text := nullif(left(trim(coalesce(p ->> 'message', '')), 3000), '');
  v_company_id uuid; v_contact_id uuid; v_event uuid; v_sugg jsonb; v_typename text; r record;
  v_site text := coalesce(nullif((select value from app_settings where key = 'site_url'), ''), 'https://fcc-bokning.vercel.app');
begin
  if coalesce(p ->> 'website', '') <> '' then return 'ok'; end if;  -- fälla för robotar
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'kontakt'; end if;
  if v_from is null or v_to is null or v_to <= v_from or v_from < now() or v_from > now() + interval '5 years' then return 'tid'; end if;
  if v_guests is not null and (v_guests < 1 or v_guests > 10000) then return 'gaster'; end if;
  if v_type is not null and not exists (select 1 from event_types where id = v_type) then v_type := null; end if;
  if v_setup is not null and not exists (select 1 from setups where id = v_setup) then v_setup := null; end if;
  if (select count(*) from inquiries where created_at > now() - interval '1 hour') >= 30 then return 'for_manga'; end if;

  -- Kontakten: befintlig på e-post, annars ny (med kund om företagsnamn angetts).
  select ct.id, ct.company_id into v_contact_id, v_company_id from contacts ct where lower(ct.email) = v_email order by ct.created_at limit 1;
  if v_contact_id is null then
    if v_company is not null then
      select id into v_company_id from companies where lower(name) = lower(v_company) order by created_at limit 1;
      if v_company_id is null then
        insert into companies (name, email, phone, notes) values (v_company, v_email, v_phone, 'Skapad från förfrågan på hemsidan') returning id into v_company_id;
      end if;
    end if;
    insert into contacts (company_id, name, email, phone) values (v_company_id, v_name, v_email, v_phone) returning id into v_contact_id;
  end if;

  v_sugg := suggest_rooms(v_from, v_to, v_days, v_guests, v_setup);
  select name into v_typename from event_types where id = v_type;
  insert into events (title, status, event_type_id, company_id, contact_id, participants, description, internal_notes)
  values (
    coalesce(v_title, coalesce(v_typename, 'Förfrågan') || ' – ' || coalesce(v_company, v_name)),
    'forfragan', v_type, v_company_id, v_contact_id, v_guests, v_msg,
    'Förfrågan från hemsidan ' || to_char(now() at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') || E'.\n'
      || 'Önskad tid: ' || to_char(v_from at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') || '–' || to_char(v_to at time zone 'Europe/Stockholm', 'HH24:MI')
      || case when v_days > 1 then ', ' || v_days || ' dagar' else '' end
      || coalesce(E'\nMöblering: ' || (select name from setups where id = v_setup), '')
      || E'\nKontakt: ' || v_name || ', ' || v_email || coalesce(', ' || v_phone, '')
      || case when jsonb_array_length(v_sugg) > 0
           then E'\nLediga lokaler som passar: ' || (select string_agg((s ->> 'name') || ' (max ' || (s ->> 'capacity') || ')', ', ') from jsonb_array_elements(v_sugg) s)
           else E'\nIngen ledig lokal som rymmer alla hittades automatiskt.' end
  ) returning id into v_event;
  insert into inquiries (event_id, data, suggested) values (v_event, p - 'website', v_sugg);

  for r in select id from profiles where active and role::text in ('admin', 'bokare') loop
    perform notify_person(r.id, 'forfragan', 'Ny förfrågan: ' || coalesce(v_company, v_name),
      to_char(v_from at time zone 'Europe/Stockholm', 'YYYY-MM-DD') || coalesce(', ' || v_guests || ' gäster', '')
        || case when jsonb_array_length(v_sugg) > 0 then ', ledigt: ' || (v_sugg -> 0 ->> 'name') else ', ingen ledig lokal hittad' end,
      '/evenemang/' || v_event, v_event);
  end loop;

  insert into email_outbox (to_email, to_name, subject, body, kind, event_id)
  values (v_email, v_name, 'Tack för er förfrågan – Filadelfia Convention Center',
    'Hej ' || split_part(v_name, ' ', 1) || E'!\n\nTack för er förfrågan. Vi har tagit emot den och återkommer så snart vi kan, oftast inom en arbetsdag.\n\n'
      || 'Önskad tid: ' || to_char(v_from at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') || '–' || to_char(v_to at time zone 'Europe/Stockholm', 'HH24:MI')
      || case when v_days > 1 then ', ' || v_days || ' dagar' else '' end
      || coalesce(E'\nAntal gäster: ' || v_guests, '')
      || E'\n\nVänliga hälsningar\nFiladelfia Convention Center',
    'forfragan', v_event);
  return 'ok';
end $$;
revoke execute on function inquiry_options(), submit_inquiry(jsonb) from public;
grant execute on function inquiry_options(), submit_inquiry(jsonb) to anon, authenticated;

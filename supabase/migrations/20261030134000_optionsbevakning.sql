-- Automatisk optionsbevakning.
-- * Några dagar innan optionen går ut får kundens kontakt ett mejl med en länk där de kan bekräfta att de vill boka eller släppa optionen.
-- * Ansvarig får en notis när mejlet går, när kunden svarar och när optionen har gått ut.
-- * Släpper kunden avbokas evenemanget, och den som flyttas upp till första plats i optionskön får besked (mejl till kontakten, notis till ansvarig).
-- * När optionen har gått ut får ansvarig en notis. Optionen släpps inte automatiskt; ansvarig bestämmer.

alter table events add column option_token uuid not null default gen_random_uuid();
create unique index events_option_token on events (option_token);
alter table events add column option_reminded_at timestamptz;
alter table events add column option_expired_notified_at timestamptz;
alter table events add column customer_response text check (customer_response in ('vill_boka', 'slapper'));
alter table events add column customer_response_at timestamptz;
alter table events add column customer_response_name text;

insert into app_settings (key, value) values ('option_reminder_days', '3') on conflict (key) do nothing;

-- Nytt optionsdatum: påminnelsen görs om.
create function events_option_reset() returns trigger language plpgsql as $$
begin
  if new.option_expires_on is distinct from old.option_expires_on then
    new.option_reminded_at := null;
    new.option_expired_notified_at := null;
  end if;
  return new;
end $$;
create trigger events_option_reset before update of option_expires_on on events for each row execute function events_option_reset();
revoke execute on function events_option_reset() from public, anon;

-- Notisslaget "option".
update profiles set notify_kinds = notify_kinds || '{option}' where not ('option' = any (notify_kinds));
alter table profiles alter column notify_kinds set default '{offert,pass,checklista,uppgift,option}';
create or replace function set_my_notify_prefs(p_kinds text[], p_scope text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set
    notify_kinds = array(select k from unnest(coalesce(p_kinds, '{}')) k where k in ('offert', 'pass', 'tid', 'checklista', 'uppgift', 'option')),
    notify_scope = case when p_scope = 'alla' then 'alla' else 'mina' end,
    notify_email = coalesce(p_email, false)
  where id = auth.uid()
$$;

-- Lokaler och tider i text för mejl och kundsida.
create function event_when_text(p_event uuid) returns text
language sql stable set search_path = public as $$
  select string_agg(
    to_char(b.starts_at at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') || '–' || to_char(b.ends_at at time zone 'Europe/Stockholm', 'HH24:MI') || ' ' || r.name,
    E'\n' order by b.starts_at)
  from bookings b join rooms r on r.id = b.room_id where b.event_id = p_event
$$;
revoke execute on function event_when_text(uuid) from public, anon, authenticated;

-- Mejl till kundens kontakt med länk till optionssidan.
create function send_option_reminder(p_event uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  e events; ct contacts;
  v_site text := coalesce(nullif((select value from app_settings where key = 'site_url'), ''), 'https://fcc-bokning.vercel.app');
  v_reply text := (select email from profiles where id = (select responsible_id from events where id = p_event));
begin
  -- Anropas av det dagliga jobbet (ingen inloggad) eller av en bokare.
  if auth.uid() is not null and not can_book() then raise exception 'Ingen behörighet'; end if;
  select * into e from events where id = p_event;
  if e.id is null or e.status <> 'preliminar' or e.option_expires_on is null then return false; end if;
  select * into ct from contacts where id = e.contact_id;
  if coalesce(ct.email, '') = '' then return false; end if;
  insert into email_outbox (to_email, to_name, subject, body, link, kind, event_id, reply_to)
  values (
    ct.email, ct.name,
    'Er option hos Filadelfia Convention Center: ' || e.title,
    'Hej ' || split_part(coalesce(ct.name, ''), ' ', 1) || E'!\n\nVi håller lokalerna för ' || e.title || ' preliminärt åt er till och med '
      || to_char(e.option_expires_on, 'YYYY-MM-DD') || E'.\n\n' || coalesce(event_when_text(e.id), '')
      || E'\n\nVia länken nedan kan ni bekräfta att ni vill boka, eller släppa optionen om ni inte behöver lokalerna. '
      || E'Har vi inte hört av er innan dess kontaktar vi er om lokalerna.\n\nVänliga hälsningar\nFiladelfia Convention Center',
    v_site || '/option/' || e.option_token, 'option', e.id, v_reply
  );
  update events set option_reminded_at = now() where id = e.id;
  return true;
end $$;
revoke execute on function send_option_reminder(uuid) from public, anon;
grant execute on function send_option_reminder(uuid) to authenticated;

-- Dagligen: påminn kunder vars option går ut snart, och säg till ansvarig om optioner som gått ut.
create function remind_options() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; n int := 0;
  v_days int := coalesce(nullif((select value from app_settings where key = 'option_reminder_days'), '')::int, 3);
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  for r in
    select e.id, e.title, e.responsible_id, e.option_expires_on from events e
    where e.status = 'preliminar' and e.option_expires_on is not null and e.option_reminded_at is null and e.customer_response is null
      and e.option_expires_on >= v_today and e.option_expires_on <= v_today + v_days
      and exists (select 1 from bookings b where b.event_id = e.id and b.ends_at > now())
  loop
    if send_option_reminder(r.id) then
      n := n + 1;
      if r.responsible_id is not null then
        perform notify_person(r.responsible_id, 'option', format('Påminnelse skickad: %s', r.title),
          format('Optionen går ut %s. Kunden har fått en länk för att bekräfta eller släppa.', to_char(r.option_expires_on, 'YYYY-MM-DD')),
          '/evenemang/' || r.id, r.id);
      end if;
    end if;
  end loop;
  for r in
    select e.id, e.title, e.responsible_id from events e
    where e.status in ('forfragan', 'preliminar') and e.option_expires_on < v_today and e.option_expired_notified_at is null
      and e.responsible_id is not null
  loop
    perform notify_person(r.responsible_id, 'option', format('Optionen har gått ut: %s', r.title), 'Bekräfta, förläng eller avboka.', '/evenemang/' || r.id, r.id);
    update events set option_expired_notified_at = now() where id = r.id;
  end loop;
  return n;
end $$;
revoke execute on function remind_options() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fcc-option-reminders', '15 6 * * *', 'select public.remind_options()');
  end if;
end $$;

-- Kundens sida: vad optionen gäller.
create function option_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', e.title, 'status', e.status, 'option_expires_on', e.option_expires_on,
    'customer_response', e.customer_response, 'customer_response_at', e.customer_response_at,
    'company_name', c.name, 'contact_name', ct.name,
    'responsible_name', p.full_name, 'responsible_email', p.email,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb)
  )
  from events e
  left join companies c on c.id = e.company_id
  left join contacts ct on ct.id = e.contact_id
  left join profiles p on p.id = e.responsible_id
  where e.option_token = p_token
$$;

-- Kunden svarar. 'vill_boka' markerar evenemanget och meddelar ansvarig, som bekräftar.
-- 'slapper' avbokar evenemanget och ger besked till dem som står på tur i optionskön.
create function option_respond(p_token uuid, p_answer text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  e events; q record; v_before uuid[];
  v_site text := coalesce(nullif((select value from app_settings where key = 'site_url'), ''), 'https://fcc-bokning.vercel.app');
  v_name text := nullif(left(trim(coalesce(p_name, '')), 80), '');
begin
  select * into e from events where option_token = p_token for update;
  if e.id is null then return 'saknas'; end if;
  if e.status not in ('forfragan', 'preliminar') then return 'stangd'; end if;
  if p_answer not in ('vill_boka', 'slapper') then return 'fel'; end if;
  if e.option_expires_on is not null and e.option_expires_on < (now() at time zone 'Europe/Stockholm')::date then return 'utgangen'; end if;
  if e.customer_response = p_answer then return 'ok'; end if;   -- samma svar igen: inga nya notiser

  if p_answer = 'vill_boka' then
    update events set customer_response = 'vill_boka', customer_response_at = now(), customer_response_name = v_name where id = e.id;
    if e.responsible_id is not null then
      perform notify_person(e.responsible_id, 'option', format('Kunden vill boka: %s', e.title),
        coalesce(v_name || ' bekräftade', 'Kunden bekräftade') || ' via optionslänken. Bekräfta bokningen.', '/evenemang/' || e.id, e.id);
    end if;
    return 'ok';
  end if;

  -- Vilka som redan står först innan avbokningen (de ska inte få beskedet).
  select coalesce(array_agg(op.event_id), '{}') into v_before from option_places op where op.place = 1;
  update events set status = 'avbokad', customer_response = 'slapper', customer_response_at = now(), customer_response_name = v_name where id = e.id;
  if e.responsible_id is not null then
    perform notify_person(e.responsible_id, 'option', format('Kunden släppte optionen: %s', e.title),
      coalesce(v_name || ' släppte', 'Kunden släppte') || ' optionen. Evenemanget är avbokat.', '/evenemang/' || e.id, e.id);
  end if;
  -- Den som nu står först i kön för någon av lokalerna får besked.
  for q in
    select distinct o.id, o.title, o.responsible_id, o.option_token, ct.email, ct.name
    from bookings b
    join bookings ob on ob.event_id <> b.event_id
      and rooms_overlap(ob.room_id, b.room_id) and tstzrange(ob.starts_at, ob.ends_at) && tstzrange(b.starts_at, b.ends_at)
    join events o on o.id = ob.event_id and o.status in ('forfragan', 'preliminar')
    left join contacts ct on ct.id = o.contact_id
    join option_places op on op.event_id = o.id and op.place = 1
    where b.event_id = e.id and b.ends_at > now() and not (o.id = any (v_before))
  loop
    if q.responsible_id is not null then
      perform notify_person(q.responsible_id, 'option', format('Först i kön: %s', q.title),
        format('%s släppte sin option, så %s står nu först.', e.title, q.title), '/evenemang/' || q.id, q.id);
    end if;
    if coalesce(q.email, '') <> '' then
      insert into email_outbox (to_email, to_name, subject, body, link, kind, event_id)
      values (q.email, q.name, 'Lokalerna är lediga för ' || q.title,
        'Hej ' || split_part(coalesce(q.name, ''), ' ', 1) || E'!\n\nGoda nyheter: lokalerna ni har förfrågat för ' || q.title
          || E' har blivit lediga, och ni står nu först på tur.\n\nVia länken nedan kan ni bekräfta att ni vill boka. Hör av er om ni har frågor.'
          || E'\n\nVänliga hälsningar\nFiladelfia Convention Center',
        v_site || '/option/' || q.option_token, 'option', q.id);
    end if;
  end loop;
  return 'ok';
end $$;
revoke execute on function option_info(uuid), option_respond(uuid, text, text) from public;
grant execute on function option_info(uuid), option_respond(uuid, text, text) to anon, authenticated;

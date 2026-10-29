-- Checklistan blir också interna uppgifter: ansvarig person, deadline relativt evenemanget (X dagar före) och påminnelser.

alter table event_checklist add column days_before int check (days_before between -365 and 730);
alter table event_checklist add column assignee_id uuid references profiles (id) on delete set null;
alter table event_checklist add column reminded_at timestamptz;
create index on event_checklist (assignee_id) where done_at is null;

-- Datum räknat från evenemangets första bokning.
create function event_first_day(p_event uuid) returns date
language sql stable set search_path = public as $$
  select (min(starts_at) at time zone 'Europe/Stockholm')::date from bookings where event_id = p_event
$$;

create function checklist_set_due() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.days_before is not null then
    new.due_date := event_first_day(new.event_id) - new.days_before;
  end if;
  if new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id then
    new.reminded_at := null;
  end if;
  return new;
end $$;
create trigger checklist_set_due before insert or update of days_before, due_date, assignee_id, event_id on event_checklist
  for each row execute function checklist_set_due();

-- När bokningarna flyttas följer de relativa datumen med.
create function bookings_move_checklist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update event_checklist k set due_date = event_first_day(k.event_id) - k.days_before
  where k.days_before is not null and k.event_id in (
    select x from (values (case when tg_op <> 'INSERT' then old.event_id end), (case when tg_op <> 'DELETE' then new.event_id end)) v(x) where x is not null
  );
  return null;
end $$;
create trigger bookings_move_checklist after insert or update of starts_at, event_id or delete on bookings
  for each row execute function bookings_move_checklist();

-- Fler notisslag: uppgifter man fått eller som snart ska vara klara.
update profiles set notify_kinds = notify_kinds || '{uppgift}' where not ('uppgift' = any (notify_kinds));
alter table profiles alter column notify_kinds set default '{offert,pass,checklista,uppgift}';
create or replace function set_my_notify_prefs(p_kinds text[], p_scope text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set
    notify_kinds = array(select k from unnest(coalesce(p_kinds, '{}')) k where k in ('offert', 'pass', 'tid', 'checklista', 'uppgift')),
    notify_scope = case when p_scope = 'alla' then 'alla' else 'mina' end,
    notify_email = coalesce(p_email, false)
  where id = auth.uid()
$$;

-- Notis direkt till en person (respekterar om personen vill ha slaget och e-post).
create function notify_person(p_profile uuid, p_kind text, p_title text, p_body text, p_link text, p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles; v_site text := coalesce(nullif((select value from app_settings where key = 'site_url'), ''), 'https://fcc-bokning.vercel.app');
begin
  select * into p from profiles where id = p_profile and active;
  if p.id is null or not (p_kind = any (p.notify_kinds)) then return; end if;
  insert into notifications (profile_id, kind, title, body, link, event_id) values (p.id, p_kind, p_title, p_body, p_link, p_event);
  if p.notify_email and p.email is not null then
    insert into email_outbox (to_email, to_name, subject, body, link, kind, event_id)
    values (p.email, p.full_name, p_title, coalesce(p_body, ''), v_site || coalesce(p_link, ''), 'notis', p_event);
  end if;
end $$;
revoke execute on function notify_person(uuid, text, text, text, text, uuid) from public, anon, authenticated;

-- Någon annan ger mig en uppgift.
create function checklist_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id and new.assignee_id is distinct from auth.uid() then
    select title into v_title from events where id = new.event_id;
    perform notify_person(new.assignee_id, 'uppgift', format('Ny uppgift: %s', new.title),
      v_title || coalesce(', senast ' || to_char(new.due_date, 'FMDD/FMMM'), ''), '/uppgifter', new.event_id);
  end if;
  return new;
end $$;
create trigger checklist_assigned after insert or update of assignee_id on event_checklist
  for each row execute function checklist_assigned();

-- Daglig påminnelse: uppgifter som ska vara klara i dag eller i morgon, eller som är försenade.
create function remind_due_tasks() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select k.id, k.title, k.due_date, k.assignee_id, k.event_id, e.title as event_title, e.responsible_id
    from event_checklist k join events e on e.id = k.event_id
    where k.done_at is null and k.reminded_at is null and k.due_date is not null
      and k.due_date <= (now() at time zone 'Europe/Stockholm')::date + 1
      and e.status::text not in ('avbokad', 'genomford')
      and coalesce(k.assignee_id, e.responsible_id) is not null
  loop
    perform notify_person(coalesce(r.assignee_id, r.responsible_id), 'uppgift',
      case when r.due_date < (now() at time zone 'Europe/Stockholm')::date then format('Försenad: %s', r.title)
           when r.due_date = (now() at time zone 'Europe/Stockholm')::date then format('I dag: %s', r.title)
           else format('I morgon: %s', r.title) end,
      r.event_title, '/uppgifter', r.event_id);
    update event_checklist set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function remind_due_tasks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fcc-task-reminders', '0 6 * * *', 'select public.remind_due_tasks()');
  end if;
end $$;

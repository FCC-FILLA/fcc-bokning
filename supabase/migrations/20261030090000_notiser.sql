-- Notiser till kontoret: kund svarar på offert, personal söker/tackar ja/nej till pass, tid rapporteras, kund bockar av checklistan.
-- Visas i appen (klockan), som appnotis i telefonen och, om man vill, som e-post.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  event_id uuid references events (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index on notifications (profile_id, created_at desc);
create index on notifications (created_at) where pushed_at is null;
alter table notifications enable row level security;
create policy "egna" on notifications for select to authenticated using (profile_id = auth.uid());
create policy "läsmarkera egna" on notifications for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, update (read_at) on notifications to authenticated;
revoke all on notifications from anon;

-- Vad var och en vill ha: vilka slags notiser, för alla evenemang eller bara egna, och om de också ska komma som e-post.
alter table profiles add column notify_kinds text[] not null default '{offert,pass,checklista}';
alter table profiles add column notify_scope text not null default 'mina' check (notify_scope in ('mina', 'alla'));
alter table profiles add column notify_email boolean not null default false;

create function set_my_notify_prefs(p_kinds text[], p_scope text, p_email boolean) returns void
language sql security definer set search_path = public as $$
  update profiles set
    notify_kinds = array(select k from unnest(coalesce(p_kinds, '{}')) k where k in ('offert', 'pass', 'tid', 'checklista')),
    notify_scope = case when p_scope = 'alla' then 'alla' else 'mina' end,
    notify_email = coalesce(p_email, false)
  where id = auth.uid()
$$;
revoke execute on function set_my_notify_prefs(text[], text, boolean) from public, anon;
grant execute on function set_my_notify_prefs(text[], text, boolean) to authenticated;

-- Skapar notiser. Med "bara mina" får man dem för evenemang/offerter/pass man är ansvarig för; finns ingen ansvarig får alla dem.
create function notify_office(p_kind text, p_title text, p_body text, p_link text, p_event uuid, p_owners uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owned boolean := exists (select 1 from profiles where id = any (coalesce(p_owners, '{}')) and active and role::text in ('admin', 'bokare', 'produktion'));
  v_site text := coalesce(nullif((select value from app_settings where key = 'site_url'), ''), 'https://fcc-bokning.vercel.app');
begin
  with m as (
    select p.id, p.email, p.full_name, p.notify_email
    from profiles p
    where p.active and p.role::text in ('admin', 'bokare', 'produktion')
      and p_kind = any (p.notify_kinds)
      and (p.notify_scope = 'alla' or not v_owned or p.id = any (p_owners))
      and p.id is distinct from auth.uid()
  ), n as (
    insert into notifications (profile_id, kind, title, body, link, event_id)
    select id, p_kind, p_title, p_body, p_link, p_event from m
  )
  insert into email_outbox (to_email, to_name, subject, body, link, kind, event_id)
  select email, full_name, p_title, coalesce(p_body, ''), v_site || coalesce(p_link, ''), 'notis', p_event
  from m where notify_email and email is not null;
end $$;
revoke execute on function notify_office(text, text, text, text, uuid, uuid[]) from public, anon, authenticated;

create function fmt_when(t timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(t at time zone 'Europe/Stockholm', 'FMDD/FMMM HH24:MI')
$$;

-- Offert: kunden accepterar eller avböjer.
create function quotes_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_company text; v_resp uuid;
begin
  if new.status is distinct from old.status and new.status::text in ('accepterad', 'avbojd') and not is_member() then
    select name into v_company from companies where id = new.company_id;
    select responsible_id into v_resp from events where id = new.event_id;
    perform notify_office(
      'offert',
      format('Offert %s %s', new.number, case when new.status::text = 'accepterad' then 'accepterad' else 'avböjd' end),
      format('%s%s har %s offerten "%s".', coalesce(new.accepted_name, 'Kunden'), coalesce(' på ' || v_company, ''),
             case when new.status::text = 'accepterad' then 'accepterat' else 'avböjt' end, new.title),
      '/offerter/' || new.id, new.event_id, array[new.salesperson_id, v_resp]);
  end if;
  return new;
end $$;
create trigger quotes_notify after update of status on quotes for each row execute function quotes_notify();

-- Pass: ansökan, ja eller nej från personalen själv, och rapporterad tid.
create function assignments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_fn text; v_start timestamptz; v_event uuid; v_title text; v_owner uuid; v_resp uuid; v_label text;
begin
  if can_manage_staff() then return new; end if;   -- planerarens egna ändringar ger ingen notis
  select st.name, f.name, sh.starts_at, sh.event_id, e.title, sh.created_by, e.responsible_id
    into v_name, v_fn, v_start, v_event, v_title, v_owner, v_resp
  from shifts sh join staff st on st.id = new.staff_id join staff_functions f on f.id = sh.function_id left join events e on e.id = sh.event_id
  where sh.id = new.shift_id;
  v_label := v_fn || ' ' || fmt_when(v_start) || coalesce(' · ' || v_title, '');

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status::text = 'ansokt' then
      perform notify_office('pass', format('%s söker ett pass', v_name), v_label, '/personal/pass/' || new.shift_id, v_event, array[v_owner, v_resp]);
    elsif new.status::text = 'tilldelad' and tg_op = 'UPDATE' and old.status::text = 'inbjuden' then
      perform notify_office('pass', format('%s tackade ja', v_name), v_label, '/personal/pass/' || new.shift_id, v_event, array[v_owner, v_resp]);
    elsif new.status::text = 'avbojd' then
      perform notify_office('pass', format('%s tackade nej', v_name), v_label, '/personal/pass/' || new.shift_id, v_event, array[v_owner, v_resp]);
    elsif new.status::text = 'aterkallad' and tg_op = 'UPDATE' and old.status::text = 'tilldelad' then
      perform notify_office('pass', format('%s har lämnat ett pass', v_name), v_label, '/personal/pass/' || new.shift_id, v_event, array[v_owner, v_resp]);
    end if;
  end if;
  if tg_op = 'UPDATE' and new.attest_status::text = 'rapporterad' and new.attest_status is distinct from old.attest_status then
    perform notify_office('tid', format('%s har rapporterat tid', v_name), v_label, '/personal/tid', v_event, array[v_owner, v_resp]);
  end if;
  return new;
end $$;
create trigger assignments_notify after insert or update on shift_assignments for each row execute function assignments_notify();

-- Checklistan: kunden bockar av en punkt.
create function checklist_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_resp uuid;
begin
  if new.done_at is not null and old.done_at is null and not is_member() then
    select title, responsible_id into v_title, v_resp from events where id = new.event_id;
    perform notify_office('checklista', format('%s: %s', v_title, new.title),
      format('Bockad av %s på eventsidan.', coalesce(new.done_by, 'kunden')), '/evenemang/' || new.event_id || '#eventsida', new.event_id, array[v_resp]);
  end if;
  return new;
end $$;
create trigger checklist_notify after update of done_at on event_checklist for each row execute function checklist_notify();

-- Appnotiser skickas av webbappen: den hämtar nya notiser med en hemlig nyckel som bara servern har.
create table app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;

create function claim_pushes(p_secret text)
returns table (id uuid, title text, body text, link text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or not exists (select 1 from app_secrets s where s.key = 'push_claim' and s.value = p_secret) then return; end if;
  return query
  with c as (
    update notifications n set pushed_at = now()
    where n.pushed_at is null and n.created_at > now() - interval '2 hours'
    returning n.id, n.profile_id, n.title, n.body, n.link
  )
  select c.id, c.title, c.body, c.link, ps.endpoint, ps.p256dh, ps.auth
  from c join push_subscriptions ps on ps.profile_id = c.profile_id;
end $$;
revoke execute on function claim_pushes(text) from public;
grant execute on function claim_pushes(text) to anon, authenticated;

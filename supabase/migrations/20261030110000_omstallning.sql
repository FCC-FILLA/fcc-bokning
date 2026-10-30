-- Omställningstid mellan bokningar och rigg/riv per bokning.
--
-- * Rigg och riv är tid som bokningen själv behöver före start och efter slut (scenbygge, ljudcheck, nedmontering).
--   De visas som egna block i kalendern och blockerar lokalen.
-- * Omställning är tiden det tar att gå från en möblering till en annan i samma lokal (t.ex. teater → bankett).
--   Varje möblering har en standardtid ("ställa om till detta"), och par kan ges egna tider.
-- * Varning när tiden mellan två bokningar i samma lokal (eller en sal och en del av den) är kortare än riv + omställning + rigg.

alter table setups add column changeover_minutes int not null default 60 check (changeover_minutes between 0 and 2880);

create table setup_changeovers (
  from_setup text not null references setups (id) on delete cascade,
  to_setup text not null references setups (id) on delete cascade,
  minutes int not null check (minutes between 0 and 2880),
  primary key (from_setup, to_setup)
);
alter table setup_changeovers enable row level security;
create policy "läs" on setup_changeovers for select to authenticated using (is_member());
create policy "admin skriver" on setup_changeovers for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on setup_changeovers to authenticated;
revoke all on setup_changeovers from anon;

alter table bookings add column rig_minutes int not null default 0 check (rig_minutes between 0 and 2880);
alter table bookings add column strike_minutes int not null default 0 check (strike_minutes between 0 and 2880);

insert into app_settings (key, value) values ('changeover_default_minutes', '30') on conflict (key) do nothing;

-- Minuter som behövs för att gå från en möblering till en annan.
-- Samma möblering: 0 (om inget eget par är angivet). Båda okända: 0. En okänd: standardtiden i inställningarna.
create function changeover_needed(p_from text, p_to text) returns int
language sql stable set search_path = public as $$
  select case
    when p_from is null and p_to is null then 0
    else coalesce(
      (select minutes from setup_changeovers where from_setup = p_from and to_setup = p_to),
      case
        when p_from = p_to then 0
        when p_to is not null then (select changeover_minutes from setups where id = p_to)
        else null
      end,
      coalesce(nullif((select value from app_settings where key = 'changeover_default_minutes'), '')::int, 30)
    )
  end
$$;
grant execute on function changeover_needed(text, text) to authenticated;

-- Par av bokningar som följer direkt på varandra i samma lokal där tiden emellan är för kort.
-- Bokningar som överlappar helt är krockar (booking_conflicts) och tas inte med här.
create view changeover_warnings with (security_invoker = true) as
select
  b1.id as booking_id, b1.event_id, e1.title as event_title, e1.status as event_status,
  r1.name as room_name, b1.starts_at, b1.ends_at, b1.strike_minutes, b1.setup_id, s1.name as setup_name,
  b2.id as next_booking_id, b2.event_id as next_event_id, e2.title as next_event_title, e2.status as next_event_status,
  r2.name as next_room_name, b2.starts_at as next_starts_at, b2.ends_at as next_ends_at, b2.rig_minutes as next_rig_minutes,
  b2.setup_id as next_setup_id, s2.name as next_setup_name,
  (extract(epoch from (b2.starts_at - b1.ends_at)) / 60)::int as gap_minutes,
  (b1.strike_minutes + b2.rig_minutes + changeover_needed(b1.setup_id, b2.setup_id)) as needed_minutes,
  changeover_needed(b1.setup_id, b2.setup_id) as changeover_minutes
from bookings b1
join events e1 on e1.id = b1.event_id and e1.status in ('forfragan', 'preliminar', 'bekraftad')
join bookings b2 on b2.id <> b1.id
  and b2.starts_at >= b1.ends_at
  and b2.starts_at < b1.ends_at + interval '3 days'
join events e2 on e2.id = b2.event_id and e2.status in ('forfragan', 'preliminar', 'bekraftad')
join rooms r1 on r1.id = b1.room_id
join rooms r2 on r2.id = b2.room_id
left join setups s1 on s1.id = b1.setup_id
left join setups s2 on s2.id = b2.setup_id
where rooms_overlap(b1.room_id, b2.room_id)
  -- Bara närmast följande bokning i lokalen.
  and not exists (
    select 1 from bookings b3 join events e3 on e3.id = b3.event_id and e3.status in ('forfragan', 'preliminar', 'bekraftad')
    where b3.id not in (b1.id, b2.id)
      and rooms_overlap(b3.room_id, b1.room_id) and rooms_overlap(b3.room_id, b2.room_id)
      and b3.starts_at >= b1.ends_at and b3.ends_at <= b2.starts_at
  )
  and extract(epoch from (b2.starts_at - b1.ends_at)) / 60 < b1.strike_minutes + b2.rig_minutes + changeover_needed(b1.setup_id, b2.setup_id);
grant select on changeover_warnings to authenticated;

-- Standardtider att börja med (kan ändras under Inställningar → Omställning).
update setups set changeover_minutes = case id
  when 'bio' then 90 when 'skol' then 90 when 'styrelse' then 45 when 'langbord' then 120
  when 'runda' then 120 when 'staende' then 45 when 'hybrid' then 120 else changeover_minutes end;

-- Optioner i turordning: flera förfrågningar och preliminära bokningar kan ligga på samma lokal och tid.
-- De räknas inte som krockar mot varandra; i stället står de i kö (1:a option, 2:a option …).
-- En krock är det först när minst det ena evenemanget är bekräftat.

alter table events add column option_rank int check (option_rank is null or option_rank > 0);

create or replace view booking_conflicts with (security_invoker = true) as
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
where rooms_overlap(b1.room_id, b2.room_id)
  and (e1.status = 'bekraftad' or e2.status = 'bekraftad');

-- Optionskön för ett evenemang: alla obekräftade evenemang som ligger på samma lokal och tid, i turordning.
-- Ordningen är option_rank (satt för hand), annars när evenemanget skapades.
create function option_queue(p_event uuid)
returns table (event_id uuid, title text, status event_status, company_name text, option_expires_on date, option_rank int, place int)
language sql stable security invoker set search_path = public as $$
  with mine as (
    select b.room_id, b.starts_at, b.ends_at
    from bookings b join events e on e.id = b.event_id
    where b.event_id = p_event and e.status in ('forfragan', 'preliminar') and b.ends_at > now()
  ),
  grp as (
    select distinct e.id
    from events e
    join bookings b on b.event_id = e.id
    join mine m on rooms_overlap(b.room_id, m.room_id) and tstzrange(b.starts_at, b.ends_at) && tstzrange(m.starts_at, m.ends_at)
    where e.status in ('forfragan', 'preliminar')
  )
  select e.id, e.title, e.status, c.name, e.option_expires_on, e.option_rank,
         (row_number() over (order by e.option_rank nulls last, e.created_at))::int
  from events e
  join grp on grp.id = e.id
  left join companies c on c.id = e.company_id
  where (select count(*) from grp) > 1
  order by 7
$$;
grant execute on function option_queue(uuid) to authenticated;

-- Vilken plats i kön varje kommande obekräftat evenemang har (för listor och kalendern). 1 = först.
create view option_places with (security_invoker = true) as
select e.id as event_id,
  1 + (
    select count(distinct o.id)
    from bookings b
    join bookings ob on ob.event_id <> b.event_id
      and rooms_overlap(ob.room_id, b.room_id) and tstzrange(ob.starts_at, ob.ends_at) && tstzrange(b.starts_at, b.ends_at)
    join events o on o.id = ob.event_id and o.status in ('forfragan', 'preliminar')
    where b.event_id = e.id and b.ends_at > now()
      and (coalesce(o.option_rank, 2147483647), o.created_at) < (coalesce(e.option_rank, 2147483647), e.created_at)
  )::int as place,
  exists (
    select 1
    from bookings b
    join bookings ob on ob.event_id <> b.event_id
      and rooms_overlap(ob.room_id, b.room_id) and tstzrange(ob.starts_at, ob.ends_at) && tstzrange(b.starts_at, b.ends_at)
    join events o on o.id = ob.event_id and o.status in ('forfragan', 'preliminar')
    where b.event_id = e.id and b.ends_at > now()
  ) as shared
from events e
where e.status in ('forfragan', 'preliminar');

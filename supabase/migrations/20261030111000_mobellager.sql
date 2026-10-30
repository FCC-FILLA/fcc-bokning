-- Möbler per dag över alla evenemang: hur många av varje möbeltyp ritningarna kräver en viss dag, jämfört med lagret.
-- En ritning hör till dagen för sin bokning, eller (utan koppling till en bokning) till alla dagar evenemanget har i ritningens lokal.
-- Inom samma evenemang och dag räknas det högsta antalet per möbeltyp (en sal som ställs om från teater till bankett använder samma stolar).

create function furniture_by_day(p_from date, p_to date)
returns table (day date, furniture_id text, name text, needed int, stock int, events jsonb)
language sql stable security invoker set search_path = public as $$
  with lay as (
    select l.id, l.event_id, l.items, d.day
    from layouts l
    join events e on e.id = l.event_id and e.status in ('forfragan', 'preliminar', 'bekraftad')
    cross join lateral (
      select distinct (b.starts_at at time zone 'Europe/Stockholm')::date as day
      from bookings b
      where (l.booking_id is not null and b.id = l.booking_id)
         or (l.booking_id is null and b.event_id = l.event_id and b.room_id = l.room_id)
    ) d
    where d.day between p_from and p_to
  ),
  per_event as (
    select lay.day, lay.event_id, c.key as furniture_id, max(c.value::int) as n
    from lay cross join lateral jsonb_each_text(layout_counts(lay.items)) c
    group by 1, 2, 3
  )
  select pe.day, pe.furniture_id, f.name, sum(pe.n)::int, f.stock,
    jsonb_agg(jsonb_build_object('event_id', pe.event_id, 'title', e.title, 'n', pe.n) order by pe.n desc)
  from per_event pe
  join furniture_types f on f.id = pe.furniture_id and f.shape <> 'fixed'
  join events e on e.id = pe.event_id
  where pe.n > 0
  group by pe.day, pe.furniture_id, f.name, f.stock, f.sort_order
  order by pe.day, f.sort_order
$$;
grant execute on function furniture_by_day(date, date) to authenticated;

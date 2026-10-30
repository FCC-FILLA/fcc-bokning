-- Statistik för ett år: beläggning per lokal och månad, offererat mot vunnet, omsättning per kundkategori och snitt per evenemangstyp.
-- Läser med den inloggades behörigheter (security invoker).

create function stats_year(p_year int) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  months as (select generate_series(1, 12) as m),
  active_b as (
    select b.room_id, b.starts_at, b.ends_at, e.status, e.event_type_id
    from bookings b join events e on e.id = b.event_id
    where e.status in ('preliminar', 'bekraftad', 'genomford')
      and b.starts_at < (make_date(p_year + 1, 1, 1)::timestamp at time zone 'Europe/Stockholm')
      and b.ends_at > (make_date(p_year, 1, 1)::timestamp at time zone 'Europe/Stockholm')
  ),
  -- Dagar per lokal och månad då lokalen (eller en sal den ingår i, eller en del av den) är bokad.
  room_days as (
    select r.id as room_id, extract(month from d.day)::int as m,
      count(distinct d.day) filter (where d.firm) as days_firm,
      count(distinct d.day) as days_all,
      sum(d.hours) filter (where d.direct and d.firm) as hours_firm
    from rooms r
    join active_b b on rooms_overlap(b.room_id, r.id)
    cross join lateral (
      select g::date as day, b.status <> 'preliminar' as firm, b.room_id = r.id as direct,
        extract(epoch from (least(b.ends_at, ((g::date + 1)::timestamp at time zone 'Europe/Stockholm'))
                            - greatest(b.starts_at, (g::date::timestamp at time zone 'Europe/Stockholm')))) / 3600 as hours
      from generate_series((b.starts_at at time zone 'Europe/Stockholm')::date, ((b.ends_at - interval '1 second') at time zone 'Europe/Stockholm')::date, interval '1 day') g
    ) d
    where r.active and r.bookable and extract(year from d.day) = p_year
    group by 1, 2
  ),
  occupancy as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'room_id', r.id, 'room', r.name, 'parent_id', r.parent_id,
      'months', (select jsonb_agg(jsonb_build_object(
        'm', mm.m,
        'days', coalesce(rd.days_firm, 0),
        'days_all', coalesce(rd.days_all, 0),
        'hours', round(coalesce(rd.hours_firm, 0)::numeric, 1),
        'days_in_month', extract(day from (make_date(p_year, mm.m, 1) + interval '1 month - 1 day'))::int
      ) order by mm.m) from months mm left join room_days rd on rd.room_id = r.id and rd.m = mm.m)
    ) order by r.sort_order), '[]'::jsonb) as j
    from rooms r where r.active and r.bookable
  ),
  q as (select * from quote_overview),
  quotes_m as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'm', mm.m,
      'sent', (select count(*) from q where extract(year from q.sent_at) = p_year and extract(month from q.sent_at) = mm.m),
      'sent_value', (select coalesce(sum(q.total_ex_vat), 0) from q where extract(year from q.sent_at) = p_year and extract(month from q.sent_at) = mm.m),
      'won', (select count(*) from q where q.status = 'accepterad' and extract(year from q.accepted_at) = p_year and extract(month from q.accepted_at) = mm.m),
      'won_value', (select coalesce(sum(q.total_ex_vat), 0) from q where q.status = 'accepterad' and extract(year from q.accepted_at) = p_year and extract(month from q.accepted_at) = mm.m),
      'lost', (select count(*) from q where q.status = 'avbojd' and extract(year from q.declined_at) = p_year and extract(month from q.declined_at) = mm.m),
      'lost_value', (select coalesce(sum(q.total_ex_vat), 0) from q where q.status = 'avbojd' and extract(year from q.declined_at) = p_year and extract(month from q.declined_at) = mm.m)
    ) order by mm.m), '[]'::jsonb) as j
    from months mm
  ),
  won as (
    select q.*, coalesce(nullif(c.categories, '{}'), '{Okategoriserad}') as cats, e.event_type_id
    from q left join companies c on c.id = q.company_id left join events e on e.id = q.event_id
    where q.status = 'accepterad' and extract(year from q.accepted_at) = p_year
  ),
  by_cat as (
    select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'count', n, 'value', v) order by v desc), '[]'::jsonb) as j
    from (select unnest(cats) as cat, count(*) as n, sum(total_ex_vat) as v from won group by 1) x
  ),
  by_type as (
    select coalesce(jsonb_agg(jsonb_build_object('type', coalesce(t.name, 'Ingen typ'), 'color', t.color, 'events', x.n, 'value', x.v, 'avg', round(x.v / nullif(x.n, 0))) order by x.v desc), '[]'::jsonb) as j
    from (
      select w.event_type_id, count(distinct coalesce(w.event_id, w.id)) as n, sum(w.total_ex_vat) as v from won w group by 1
    ) x left join event_types t on t.id = x.event_type_id
  ),
  events_y as (
    select e.status, count(*) as n
    from events e
    where exists (select 1 from bookings b where b.event_id = e.id and extract(year from b.starts_at at time zone 'Europe/Stockholm') = p_year)
    group by 1
  )
  select jsonb_build_object(
    'year', p_year,
    'occupancy', (select j from occupancy),
    'quotes', (select j from quotes_m),
    'by_category', (select j from by_cat),
    'by_type', (select j from by_type),
    'events', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from events_y),
    'participants', (select coalesce(sum(e.participants), 0) from events e
                     where e.status in ('bekraftad', 'genomford')
                       and exists (select 1 from bookings b where b.event_id = e.id and extract(year from b.starts_at at time zone 'Europe/Stockholm') = p_year))
  )
$$;
revoke execute on function stats_year(int) from public, anon;
grant execute on function stats_year(int) to authenticated;

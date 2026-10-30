-- Mer statistik för ett år: största kunder, lokalintäkt per lokal, bokade timmar per veckodag och tid på dygnet,
-- framförhållning, förfrågningar från hemsidan och personaltimmar. Läser med den inloggades behörigheter.

create function stats_more(p_year int) returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  y as (
    select (make_date(p_year, 1, 1)::timestamp at time zone 'Europe/Stockholm') as y0,
           (make_date(p_year + 1, 1, 1)::timestamp at time zone 'Europe/Stockholm') as y1
  ),
  bk as (
    select b.*, e.company_id, e.status, e.created_at as ev_created, e.event_type_id,
      extract(epoch from (least(b.ends_at, y.y1) - greatest(b.starts_at, y.y0))) / 3600 as h
    from bookings b join events e on e.id = b.event_id, y
    where e.status in ('bekraftad', 'genomford') and e.billing_month is null
      and b.starts_at < y.y1 and b.ends_at > y.y0
      and b.ends_at - b.starts_at <= interval '14 days'      -- orimligt långa importerade bokningar räknas inte
  ),
  won as (
    select q.* from quote_overview q where q.status = 'accepterad' and extract(year from q.accepted_at at time zone 'Europe/Stockholm') = p_year
  ),
  top_c as (
    select coalesce(jsonb_agg(x order by x.value desc, x.hours desc), '[]'::jsonb) as j from (
      select c.id, c.name,
        coalesce((select sum(w.total_ex_vat) from won w where w.company_id = c.id), 0) as value,
        coalesce((select round(sum(bk.h)::numeric) from bk where bk.company_id = c.id), 0) as hours,
        (select count(distinct bk.event_id) from bk where bk.company_id = c.id) as events
      from companies c
      where exists (select 1 from won w where w.company_id = c.id) or exists (select 1 from bk where bk.company_id = c.id)
      order by 3 desc, 4 desc limit 15
    ) x
  ),
  room_rev as (
    select coalesce(jsonb_agg(jsonb_build_object('room', r.name, 'value', x.v) order by x.v desc), '[]'::jsonb) as j from (
      select a.room_id, sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2)) as v
      from won w join quote_lines l on l.quote_id = w.id and l.kind = 'ingar' join articles a on a.id = l.article_id
      where a.room_id is not null group by 1
    ) x join rooms r on r.id = x.room_id
  ),
  -- Timmar per veckodag (1 = måndag) och timme, för de bokningar som börjar under året.
  wk as (
    select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'hours', round(hh::numeric, 1)) order by dow, hr), '[]'::jsonb) as j from (
      select extract(isodow from g at time zone 'Europe/Stockholm')::int as dow, extract(hour from g at time zone 'Europe/Stockholm')::int as hr, count(*) as hh
      from bk, generate_series(date_trunc('hour', bk.starts_at), bk.ends_at - interval '1 minute', interval '1 hour') g
      group by 1, 2
    ) x
  ),
  lead as (
    select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'events', n) order by ord), '[]'::jsonb) as j from (
      select case when d < 14 then 'Under 2 veckor' when d < 60 then '2 veckor–2 mån' when d < 180 then '2–6 mån' when d < 365 then '6–12 mån' else 'Över ett år' end as bucket,
             min(case when d < 14 then 1 when d < 60 then 2 when d < 180 then 3 when d < 365 then 4 else 5 end) as ord, count(*) as n
      from (
        select e.id, extract(epoch from (min(b.starts_at) - e.created_at)) / 86400 as d
        from events e join bookings b on b.event_id = e.id, y
        where e.status in ('bekraftad', 'genomford') and e.billing_month is null
        group by e.id, e.created_at, y.y0, y.y1
        having min(b.starts_at) >= y.y0 and min(b.starts_at) < y.y1
      ) z where d >= 0 group by 1
    ) x
  ),
  inq as (
    select coalesce(jsonb_agg(jsonb_build_object('m', mm, 'count', n, 'won', w) order by mm), '[]'::jsonb) as j from (
      select extract(month from i.created_at at time zone 'Europe/Stockholm')::int as mm, count(*) as n,
        count(*) filter (where e.status in ('bekraftad', 'genomford')) as w
      from inquiries i left join events e on e.id = i.event_id
      where extract(year from i.created_at at time zone 'Europe/Stockholm') = p_year group by 1
    ) x
  ),
  staff_h as (
    select coalesce(jsonb_agg(jsonb_build_object('m', mm, 'hours', round(hh::numeric, 1), 'shifts', n) order by mm), '[]'::jsonb) as j from (
      select extract(month from s.starts_at at time zone 'Europe/Stockholm')::int as mm,
        sum(extract(epoch from (coalesce(a.actual_end, s.ends_at) - coalesce(a.actual_start, s.starts_at))) / 3600) as hh, count(distinct s.id) as n
      from shifts s join shift_assignments a on a.shift_id = s.id and a.status = 'tilldelad'
      where extract(year from s.starts_at at time zone 'Europe/Stockholm') = p_year group by 1
    ) x
  )
  select jsonb_build_object(
    'top_customers', (select j from top_c),
    'room_revenue', (select j from room_rev),
    'week', (select j from wk),
    'lead', (select j from lead),
    'inquiries', (select j from inq),
    'staff', (select j from staff_h),
    'booked_hours', (select coalesce(round(sum(h)::numeric), 0) from bk)
  )
$$;
revoke execute on function stats_more(int) from public, anon;
grant execute on function stats_more(int) to authenticated;

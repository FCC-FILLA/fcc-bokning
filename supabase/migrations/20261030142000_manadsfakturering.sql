-- Månadsfakturering av lokalhyra (t.ex. Filadelfiaförsamlingen).
-- Kunden har ingen offert per evenemang utan betalar per timme och bokad lokal. En gång i månaden tas ett offertutkast fram
-- med all bokad tid förra månaden (inklusive bygg och riv). Timpris = lokalens dagshyra / delare (10), med kundens rabatt (60 %).
-- Högst en dagshyra per bokning och dygn. Offerten kopplas till ett eget "månadsevenemang" så att fakturaunderlaget
-- sedan skapas på vanligt sätt. Inget skickas automatiskt.

alter table companies add column monthly_billing boolean not null default false;
alter table companies add column monthly_hour_divisor numeric(6, 2) not null default 10 check (monthly_hour_divisor > 0);
alter table companies add column monthly_discount_pct numeric(5, 2) not null default 0 check (monthly_discount_pct between 0 and 100);

-- Evenemang som bara samlar en månads fakturering (har inga egna bokningar).
alter table events add column billing_month date;

create table monthly_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  quote_id uuid references quotes (id) on delete set null,
  event_id uuid references events (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, month)
);
alter table monthly_quotes enable row level security;
create policy "läs" on monthly_quotes for select to authenticated using (is_member());
create policy "bokare skriver" on monthly_quotes for all to authenticated using (can_book()) with check (can_book());
grant select, insert, update, delete on monthly_quotes to authenticated;
revoke all on monthly_quotes from anon;

update companies set monthly_billing = true, monthly_hour_divisor = 10, monthly_discount_pct = 60
where lower(name) = lower('Filadelfiaförsamlingen i Stockholm');

create function sv_month(p_month date) returns text language sql immutable set search_path = public as $$
  select (array['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'])[extract(month from p_month)::int]
    || ' ' || extract(year from p_month)::int
$$;

create function sv_num(p numeric) returns text language sql immutable set search_path = public as $$
  select replace(case when p = trunc(p) then trunc(p)::text else rtrim(round(p, 2)::text, '0') end, '.', ',')
$$;

-- Rader för en månad: en per bokning, med timmar som ligger i månaden (högst en dagshyra per dygn), bygg/riv och pris.
create function monthly_room_lines(p_company uuid, p_month date) returns table (
  booking_id uuid, event_id uuid, event_title text, room_id uuid, room_name text, starts_at timestamptz, ends_at timestamptz,
  hours numeric, rig_hours numeric, capped boolean, article_id uuid, day_price numeric, vat_rate numeric, hourly numeric, discount_pct numeric
)
language sql stable security invoker set search_path = public as $$
  with
  c as (select monthly_hour_divisor as div, monthly_discount_pct as disc from companies where id = p_company),
  m as (
    select (date_trunc('month', p_month)::date::timestamp at time zone 'Europe/Stockholm') as m0,
           ((date_trunc('month', p_month) + interval '1 month')::date::timestamp at time zone 'Europe/Stockholm') as m1
  ),
  b as (
    select bk.*, e.title,
      bk.starts_at - make_interval(mins => coalesce(bk.rig_minutes, 0)) as s0,
      bk.ends_at + make_interval(mins => coalesce(bk.strike_minutes, 0)) as e0
    from bookings bk join events e on e.id = bk.event_id, m
    where e.company_id = p_company and e.status in ('preliminar', 'bekraftad', 'genomford') and e.billing_month is null
      and bk.starts_at < m.m1 and bk.ends_at > m.m0
  ),
  per_day as (
    select b.id,
      -- timmar per dygn inom månaden, inklusive bygg/riv
      extract(epoch from (least(b.e0, d1, m.m1) - greatest(b.s0, d0, m.m0))) / 3600 as h,
      extract(epoch from (least(b.ends_at, d1, m.m1) - greatest(b.starts_at, d0, m.m0))) / 3600 as h_booked
    from b, m,
      lateral (select g::date::timestamp at time zone 'Europe/Stockholm' as d0, (g::date + 1)::timestamp at time zone 'Europe/Stockholm' as d1
               from generate_series((greatest(b.s0, m.m0) at time zone 'Europe/Stockholm')::date,
                                    ((least(b.e0, m.m1) - interval '1 second') at time zone 'Europe/Stockholm')::date, interval '1 day') g) days
  ),
  sums as (
    select p.id,
      sum(least(greatest(p.h, 0), (select div from c))) as h,
      sum(greatest(p.h, 0)) as h_raw,
      sum(greatest(p.h_booked, 0)) as h_booked
    from per_day p group by p.id
  )
  select b.id, b.event_id, b.title, b.room_id, r.name, b.starts_at, b.ends_at,
    round(s.h::numeric, 2),
    round(greatest(s.h_raw - s.h_booked, 0)::numeric, 2),
    s.h_raw > s.h + 0.001,
    a.id, a.price, coalesce(a.vat_rate, 25),
    round(coalesce(a.price, 0) / (select div from c), 2),
    (select disc from c)
  from b
  join sums s on s.id = b.id
  join rooms r on r.id = b.room_id
  left join lateral (
    select ar.id, ar.price, ar.vat_rate from articles ar
    where ar.room_id = b.room_id and ar.active and ar.price is not null
    order by (ar.unit = 'dag') desc, ar.sort_order limit 1
  ) a on true
  where s.h > 0
  order by b.starts_at, r.sort_order
$$;
revoke execute on function monthly_room_lines(uuid, date) from public, anon;
grant execute on function monthly_room_lines(uuid, date) to authenticated;

-- Skapar (eller gör om) månadens offertutkast. Ett utkast som redan skickats eller godkänts rörs inte.
-- p_extra: offerter på kundens evenemang i månaden vars rader (utom lokalhyra) ska tas med, t.ex. mat och teknik.
create function create_monthly_quote(p_company uuid, p_month date, p_replace boolean default false, p_extra uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  co companies; v_month date := date_trunc('month', p_month)::date; mq monthly_quotes; v_event uuid; v_quote uuid; v_n int := 0;
  r record; v_status quote_status;
begin
  if auth.uid() is not null and not can_book() then raise exception 'Ingen behörighet'; end if;
  select * into co from companies where id = p_company;
  if co.id is null then raise exception 'Kunden finns inte'; end if;
  select * into mq from monthly_quotes where company_id = p_company and month = v_month;
  if mq.id is not null and mq.quote_id is not null then
    select status into v_status from quotes where id = mq.quote_id;
    if v_status is not null and (not p_replace or v_status <> 'utkast') then return mq.quote_id; end if;
    delete from quotes where id = mq.quote_id;
  end if;

  v_event := mq.event_id;
  if v_event is null or not exists (select 1 from events where id = v_event) then
    insert into events (title, status, company_id, billing_month, description)
    values ('Lokalhyra ' || sv_month(v_month) || ' – ' || co.name, 'genomford', co.id, v_month,
            'Samlar månadens lokalhyra för fakturering. Bokningarna finns på kundens egna evenemang.')
    returning id into v_event;
  end if;

  insert into quotes (title, status, event_id, company_id, intro, created_by)
  values ('Lokalhyra ' || sv_month(v_month), 'utkast', v_event, co.id,
          'Lokalhyra för bokad tid i ' || sv_month(v_month) || ', inklusive bygg och riv. Timpris är dagshyran delat på '
            || sv_num(co.monthly_hour_divisor) || ', högst en dagshyra per lokal och dygn'
            || case when co.monthly_discount_pct > 0 then ', med ' || sv_num(co.monthly_discount_pct) || ' % rabatt.' else '.' end,
          auth.uid())
  returning id into v_quote;

  for r in select * from monthly_room_lines(p_company, v_month) loop
    v_n := v_n + 1;
    insert into quote_lines (quote_id, group_id, article_id, description, line_date, quantity, unit, unit_price, discount_pct, vat_rate, kind, sort_order)
    values (v_quote, 'lokal', r.article_id,
      r.room_name || ' ' || to_char(r.starts_at at time zone 'Europe/Stockholm', 'FMDD/FMMM HH24:MI') || '–'
        || to_char(r.ends_at at time zone 'Europe/Stockholm', case when (r.ends_at at time zone 'Europe/Stockholm')::date = (r.starts_at at time zone 'Europe/Stockholm')::date then 'HH24:MI' else 'FMDD/FMMM HH24:MI' end)
        || ' · ' || r.event_title
        || case when r.rig_hours > 0 then ' (inkl. ' || sv_num(r.rig_hours) || ' h bygg/riv)' else '' end
        || case when r.day_price is null then ' – PRIS SAKNAS' else '' end,
      (r.starts_at at time zone 'Europe/Stockholm')::date, r.hours, 'tim', r.hourly, r.discount_pct, r.vat_rate, 'ingar', v_n);
  end loop;

  -- Tillägg från kundens egna offerter (mat, teknik …), utan lokalhyran.
  insert into quote_lines (quote_id, group_id, article_id, description, line_date, quantity, unit, unit_price, cost, discount_pct, vat_rate, kind, sort_order)
  select v_quote, l.group_id, l.article_id, l.description || ' · ' || coalesce(e.title, q.title), l.line_date, l.quantity, l.unit, l.unit_price, l.cost,
         l.discount_pct, l.vat_rate, l.kind, 1000 + row_number() over (order by q.number, l.sort_order)
  from quotes q join quote_lines l on l.quote_id = q.id left join events e on e.id = q.event_id
  where q.id = any (coalesce(p_extra, '{}')) and q.company_id = p_company and q.status <> 'avbojd' and l.group_id <> 'lokal';

  insert into monthly_quotes (company_id, month, quote_id, event_id) values (p_company, v_month, v_quote, v_event)
  on conflict (company_id, month) do update set quote_id = excluded.quote_id, event_id = excluded.event_id, created_at = now();
  return v_quote;
end $$;
revoke execute on function create_monthly_quote(uuid, date, boolean, uuid[]) from public, anon;
grant execute on function create_monthly_quote(uuid, date, boolean, uuid[]) to authenticated;

-- Den 1:a varje månad: utkast för förra månaden till alla månadsfakturerade kunder, och en notis till bokarna.
create function create_monthly_quotes() returns int
language plpgsql security definer set search_path = public as $$
declare c record; p record; v_q uuid; v_n int := 0;
  v_month date := (date_trunc('month', (now() at time zone 'Europe/Stockholm')) - interval '1 month')::date;
begin
  for c in select id, name from companies where monthly_billing loop
    if exists (select 1 from monthly_quotes where company_id = c.id and month = v_month) then continue; end if;
    v_q := create_monthly_quote(c.id, v_month, false, '{}');
    v_n := v_n + 1;
    for p in select id from profiles where active and role::text in ('admin', 'bokare') loop
      perform notify_person(p.id, 'offert', format('Månadsoffert klar att granska: %s', c.name),
        format('Lokalhyra %s. Utkastet är inte skickat.', sv_month(v_month)), '/offerter/' || v_q, null);
    end loop;
  end loop;
  return v_n;
end $$;
revoke execute on function create_monthly_quotes() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fcc-monthly-quotes', '40 5 1 * *', 'select public.create_monthly_quotes()');
  end if;
end $$;

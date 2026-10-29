-- Steg B: tidrapport, attest och låsning av månader.

-- ---------------------------------------------------------------------------
-- Låsta månader. När en månad är låst kan tid för pass som börjar den månaden inte ändras.
-- ---------------------------------------------------------------------------
create table time_periods (
  month date primary key check (extract(day from month) = 1),
  locked_at timestamptz,
  locked_by uuid references profiles (id),
  exported_at timestamptz,
  note text
);
alter table time_periods enable row level security;
create policy "läs" on time_periods for select to authenticated using (is_member());
create policy "planerare skriver" on time_periods for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on time_periods to authenticated;
revoke all on time_periods from anon;

-- Första dagen i månaden (svensk tid) för en tidpunkt.
create function month_of(ts timestamptz) returns date
language sql immutable set search_path = public as $$
  select date_trunc('month', ts at time zone 'Europe/Stockholm')::date
$$;

create function is_month_locked(ts timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from time_periods where month = month_of(ts) and locked_at is not null)
$$;

-- Spärr: tid och attest på pass i låsta månader går inte att ändra.
create function guard_locked_time() returns trigger
language plpgsql security definer set search_path = public as $$
declare st timestamptz;
begin
  select starts_at into st from shifts where id = coalesce(new.shift_id, old.shift_id);
  if st is not null and is_month_locked(st) then
    if tg_op = 'DELETE' then
      raise exception 'Månaden är låst' using errcode = 'P0001';
    end if;
    if (new.actual_start, new.actual_end, new.break_minutes, new.attest_status, new.status)
       is distinct from (old.actual_start, old.actual_end, old.break_minutes, old.attest_status, old.status) then
      raise exception 'Månaden är låst' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger shift_assignments_lock before update or delete on shift_assignments
  for each row execute function guard_locked_time();

-- Spärr: man får inte attestera sin egen tid.
create function guard_self_attest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.attest_status = 'attesterad' and new.attest_status is distinct from old.attest_status then
    if exists (select 1 from staff where id = new.staff_id and profile_id = auth.uid()) then
      raise exception 'Du kan inte attestera din egen tid' using errcode = 'P0001';
    end if;
    new.attested_by := auth.uid();
    new.attested_at := now();
  end if;
  return new;
end $$;
create trigger shift_assignments_self_attest before update on shift_assignments
  for each row execute function guard_self_attest();

-- ---------------------------------------------------------------------------
-- Portalen: rapportera faktisk tid på ett eget pass.
-- ---------------------------------------------------------------------------
create function portal_report_time(p_shift uuid, p_start timestamptz, p_end timestamptz, p_break int, p_comment text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_staff_id();
  a shift_assignments;
  sh shifts;
begin
  if me is null then return 'ej_personal'; end if;
  select * into a from shift_assignments where shift_id = p_shift and staff_id = me;
  select * into sh from shifts where id = p_shift;
  if a.id is null or a.status <> 'tilldelad' then return 'ej_tilldelad'; end if;
  if sh.starts_at > now() + interval '2 hours' then return 'for_tidigt'; end if;
  if a.attest_status = 'attesterad' then return 'attesterad'; end if;
  if is_month_locked(sh.starts_at) then return 'last'; end if;
  if p_end <= p_start or p_end - p_start > interval '24 hours' then return 'ogiltig_tid'; end if;
  if coalesce(p_break, 0) < 0 or coalesce(p_break, 0) * interval '1 minute' >= p_end - p_start then return 'ogiltig_rast'; end if;
  update shift_assignments
  set actual_start = p_start, actual_end = p_end, break_minutes = coalesce(p_break, 0),
      report_comment = nullif(trim(coalesce(p_comment, '')), ''), reported_at = now(), attest_status = 'rapporterad',
      attest_comment = null
  where id = a.id;
  return 'ok';
end $$;
revoke execute on function portal_report_time(uuid, timestamptz, timestamptz, int, text) from public, anon;
grant execute on function portal_report_time(uuid, timestamptz, timestamptz, int, text) to authenticated;
revoke execute on function guard_locked_time(), guard_self_attest() from public, anon, authenticated;

-- Portalens lista får tidrapporten med.
create or replace function portal_shifts() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select my_staff_id() as id)
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', sh.id,
      'starts_at', sh.starts_at,
      'ends_at', sh.ends_at,
      'function', f.name,
      'color', f.color,
      'title', sh.title,
      'note', sh.note,
      'event', e.title,
      'room', r.name,
      'needed', sh.needed,
      'filled', (select count(*) from shift_assignments x where x.shift_id = sh.id and x.status = 'tilldelad'),
      'my_status', a.status,
      'open', sh.status = 'oppen',
      'actual_start', a.actual_start,
      'actual_end', a.actual_end,
      'break_minutes', a.break_minutes,
      'report_comment', a.report_comment,
      'attest_status', a.attest_status,
      'attest_comment', a.attest_comment,
      'locked', is_month_locked(sh.starts_at)
    ) as x
    from shifts sh
    join staff_functions f on f.id = sh.function_id
    left join events e on e.id = sh.event_id
    left join rooms r on r.id = sh.room_id
    left join shift_assignments a on a.shift_id = sh.id and a.staff_id = (select id from me)
    where (select id from me) is not null
      and (
        a.id is not null
        or (
          sh.status = 'oppen' and sh.staff_kind = 'intern' and sh.ends_at > now()
          and exists (select 1 from staff_skills k where k.staff_id = (select id from me) and k.function_id = sh.function_id)
        )
      )
  ) s
$$;

-- E-postadress till ekonomi för tidsunderlaget.
insert into app_settings (key, value) values ('payroll_email', '') on conflict (key) do nothing;

-- Låst search_path på behörighetsfunktionerna (Supabase-rådgivarens varning).
alter function is_member() set search_path = public;
alter function can_manage_staff() set search_path = public;

-- ---------------------------------------------------------------------------
-- Appnotiser (web push). Varje inloggad enhet sparar sin prenumeration.
-- ---------------------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "egna" on push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update, delete on push_subscriptions to authenticated;
revoke all on push_subscriptions from anon;

-- Planerare hämtar mottagare för en notis: personer (staff) direkt, eller alla med en viss funktion.
create function push_targets(p_staff uuid[], p_function uuid default null)
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select ps.endpoint, ps.p256dh, ps.auth
  from push_subscriptions ps
  join staff s on s.profile_id = ps.profile_id and s.active
  join profiles p on p.id = s.profile_id and p.active
  where can_manage_staff()
    and (
      s.id = any (coalesce(p_staff, '{}'))
      or (p_function is not null and s.kind = 'intern' and exists (select 1 from staff_skills k where k.staff_id = s.id and k.function_id = p_function))
    )
$$;

-- Prenumerationer som push-tjänsten säger inte längre finns.
create function push_forget(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and can_manage_staff()
$$;

revoke execute on function push_targets(uuid[], uuid), push_forget(text) from public, anon;
grant execute on function push_targets(uuid[], uuid), push_forget(text) to authenticated;

-- Personalens tillgänglighet: personalen markerar själv när de inte kan jobba (i portalen eller på sin länk).
-- Planerarna ser det när de bemannar, och inbjudningskedjan hoppar över den som är ledig eller redan jobbar då.

create table staff_unavailability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on staff_unavailability (staff_id, starts_at);
alter table staff_unavailability enable row level security;
create policy "läs" on staff_unavailability for select to authenticated using (is_member());
create policy "planerare skriver" on staff_unavailability for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on staff_unavailability to authenticated;
revoke all on staff_unavailability from anon;

-- Är personen upptagen: markerat ledig, eller redan tilldelad ett annat pass som överlappar.
create function staff_busy(p_staff uuid, p_from timestamptz, p_to timestamptz, p_except_shift uuid default null, p_count_invited boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_unavailability u
    where u.staff_id = p_staff and tstzrange(u.starts_at, u.ends_at) && tstzrange(p_from, p_to)
  ) or exists (
    select 1 from shift_assignments a join shifts s on s.id = a.shift_id
    where a.staff_id = p_staff and s.id is distinct from p_except_shift
      and (a.status::text = 'tilldelad' or (p_count_invited and a.status::text = 'inbjuden'))
      and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_from, p_to)
  )
$$;
-- Bara för databasen själv (kedjan); planerarna använder staff_busy_reason.
revoke execute on function staff_busy(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;

-- Varför någon är upptagen (för planerarna): ledighet eller annat pass.
create function staff_busy_reason(p_staff uuid, p_from timestamptz, p_to timestamptz, p_except_shift uuid default null) returns text
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select 'Ledig' || coalesce(': ' || nullif(u.note, ''), '') from staff_unavailability u
      where u.staff_id = p_staff and tstzrange(u.starts_at, u.ends_at) && tstzrange(p_from, p_to) order by u.starts_at limit 1),
    (select 'Jobbar ' || f.name || ' ' || to_char(s.starts_at at time zone 'Europe/Stockholm', 'HH24:MI') || '–' || to_char(s.ends_at at time zone 'Europe/Stockholm', 'HH24:MI')
      from shift_assignments a join shifts s on s.id = a.shift_id join staff_functions f on f.id = s.function_id
      where a.staff_id = p_staff and a.status::text = 'tilldelad' and s.id is distinct from p_except_shift
        and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_from, p_to) limit 1)
  )
$$;
revoke execute on function staff_busy_reason(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function staff_busy_reason(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- Personalens egna ledigheter. Internpersonal via inloggning, frilans och leverantörer via sin länk.
create function unavailability_list(p_staff uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'starts_at', starts_at, 'ends_at', ends_at, 'note', note) order by starts_at), '[]'::jsonb)
  from staff_unavailability where staff_id = p_staff and ends_at > now() - interval '1 day'
$$;
revoke execute on function unavailability_list(uuid) from public, anon, authenticated;

create function unavailability_add(p_staff uuid, p_from timestamptz, p_to timestamptz, p_note text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_staff is null then return 'saknas'; end if;
  if p_to <= p_from or p_to < now() or p_to - p_from > interval '400 days' then return 'tid'; end if;
  insert into staff_unavailability (staff_id, starts_at, ends_at, note) values (p_staff, p_from, p_to, nullif(left(trim(coalesce(p_note, '')), 200), ''));
  return 'ok';
end $$;
revoke execute on function unavailability_add(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;

create function my_unavailability() returns jsonb
language sql stable security definer set search_path = public as $$
  select unavailability_list((select id from staff where profile_id = auth.uid() and active))
$$;
create function my_unavailability_add(p_from timestamptz, p_to timestamptz, p_note text) returns text
language sql security definer set search_path = public as $$
  select unavailability_add((select id from staff where profile_id = auth.uid() and active), p_from, p_to, p_note)
$$;
create function my_unavailability_delete(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from staff_unavailability where id = p_id and staff_id = (select id from staff where profile_id = auth.uid())
$$;
revoke execute on function my_unavailability(), my_unavailability_add(timestamptz, timestamptz, text), my_unavailability_delete(uuid) from public, anon;
grant execute on function my_unavailability(), my_unavailability_add(timestamptz, timestamptz, text), my_unavailability_delete(uuid) to authenticated;

create function link_unavailability(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select unavailability_list((select id from staff where link_token = p_token and active))
$$;
create function link_unavailability_add(p_token uuid, p_from timestamptz, p_to timestamptz, p_note text) returns text
language sql security definer set search_path = public as $$
  select unavailability_add((select id from staff where link_token = p_token and active), p_from, p_to, p_note)
$$;
create function link_unavailability_delete(p_token uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from staff_unavailability where id = p_id and staff_id = (select id from staff where link_token = p_token)
$$;
revoke execute on function link_unavailability(uuid), link_unavailability_add(uuid, timestamptz, timestamptz, text), link_unavailability_delete(uuid, uuid) from public;
grant execute on function link_unavailability(uuid), link_unavailability_add(uuid, timestamptz, timestamptz, text), link_unavailability_delete(uuid, uuid) to anon, authenticated;

-- Kedjan hoppar över den som är upptagen (personen ligger kvar i kön och kan bjudas in om ledigheten tas bort).
create or replace function advance_invites(p_shift uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  sh shifts;
  open_slots int;
  nxt record;
  invited int := 0;
  site text := coalesce((select value from app_settings where key = 'site_url'), '');
  fname text;
  ev text;
begin
  if auth.uid() is not null and not can_manage_staff() and p_shift is null then
    raise exception 'Ingen behörighet';
  end if;

  -- Obesvarade inbjudningar med passerad svarstid.
  update shift_assignments a set status = 'utgangen', decided_at = now()
  where a.status::text = 'inbjuden' and a.respond_by is not null and a.respond_by < now()
    and (p_shift is null or a.shift_id = p_shift);

  for sh in
    select * from shifts s
    where s.staff_kind = 'frilans' and s.status = 'oppen' and s.starts_at > now()
      and (p_shift is null or s.id = p_shift)
      and exists (select 1 from shift_assignments q where q.shift_id = s.id and q.status::text = 'vantar')
  loop
    select sh.needed - count(*) filter (where status::text in ('tilldelad', 'inbjuden')) into open_slots
    from shift_assignments where shift_id = sh.id;
    select name into fname from staff_functions where id = sh.function_id;
    select title into ev from events where id = sh.event_id;

    while open_slots > 0 loop
      select a.id, a.staff_id, st.email, st.name, st.link_token into nxt
      from shift_assignments a join staff st on st.id = a.staff_id
      where a.shift_id = sh.id and a.status::text = 'vantar' and st.active
        and not staff_busy(st.id, sh.starts_at, sh.ends_at, sh.id, true)
      order by a.invite_order nulls last, a.applied_at
      limit 1;
      exit when nxt.id is null;

      update shift_assignments
      set status = 'inbjuden', invited_at = now(),
          respond_by = least(now() + make_interval(hours => sh.respond_hours), sh.starts_at)
      where id = nxt.id;

      if coalesce(nxt.email, '') <> '' then
        insert into email_outbox (to_email, to_name, subject, body, link, kind, shift_id, staff_id)
        values (
          nxt.email, nxt.name,
          'Förfrågan: ' || fname || ' ' || shift_when(sh),
          'Hej ' || split_part(nxt.name, ' ', 1) || E'!\n\nVi undrar om du kan jobba som ' || lower(fname) || ' ' || shift_when(sh)
            || coalesce(E' på ' || ev, '') || E'.\n\nSvara senast '
            || to_char(least(now() + make_interval(hours => sh.respond_hours), sh.starts_at) at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI')
            || E' via länken nedan. Svarar du inte går frågan vidare till nästa person.\n\nFiladelfia Convention Center',
          site || '/pass/' || nxt.link_token, 'inbjudan', sh.id, nxt.staff_id
        );
      end if;
      invited := invited + 1;
      open_slots := open_slots - 1;
    end loop;
  end loop;
  return invited;
end $$;
revoke execute on function advance_invites(uuid) from public, anon;
grant execute on function advance_invites(uuid) to authenticated;

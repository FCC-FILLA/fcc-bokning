-- Kontorsskärm (/skarm/<nyckel>): dagens och veckans evenemang för en skärm på kontoret.
-- Sidan är öppen utan inloggning men kräver den hemliga nyckeln. Nyckeln ligger i app_settings
-- och byts av en administratör under Inställningar → Kontorsskärm.
-- Funktionen lämnar bara ut det skärmen visar: inga priser, kontaktuppgifter eller interna anteckningar.

insert into app_settings (key, value) values ('screen_token', gen_random_uuid()::text)
on conflict (key) do nothing;

create function screen_feed(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz := date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
  t1 timestamptz := t0 + interval '8 days';
begin
  if p_token is null or p_token::text is distinct from (select value from app_settings where key = 'screen_token') then
    return null;
  end if;

  return jsonb_build_object(
    'now', now(),
    'rooms', (
      select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'parent', p.name) order by coalesce(p.sort_order, r.sort_order), r.parent_id nulls first, r.sort_order), '[]'::jsonb)
      from rooms r left join rooms p on p.id = r.parent_id
      where r.active and r.bookable and r.name not like 'Kök%' and r.name <> 'Kontrollrum'
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x->>'start'), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'status', e.status,
          'type', t.name,
          'color', t.color,
          'company', c.name,
          'participants', e.participants,
          'responsible', pr.full_name,
          'staff_info', e.staff_info,
          'start', min(b.starts_at),
          'end', max(b.ends_at),
          'bookings', jsonb_agg(jsonb_build_object('room', r.name, 'start', b.starts_at, 'end', b.ends_at, 'setup', s.name, 'phase', b.phase)
                                order by b.starts_at, r.sort_order),
          'shifts', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'function', f.name, 'color', f.color, 'start', sh.starts_at, 'end', sh.ends_at, 'needed', sh.needed,
                     'assigned', (select count(*) from shift_assignments a where a.shift_id = sh.id and a.status = 'tilldelad'))
                   order by sh.starts_at, f.sort_order), '[]'::jsonb)
            from shifts sh join staff_functions f on f.id = sh.function_id
            where sh.event_id = e.id and sh.status <> 'utkast' and sh.ends_at > t0 and sh.starts_at < t1
          )
        ) as x
        from bookings b
        join events e on e.id = b.event_id
        join rooms r on r.id = b.room_id
        left join setups s on s.id = b.setup_id
        left join event_types t on t.id = e.event_type_id
        left join companies c on c.id = e.company_id
        left join profiles pr on pr.id = e.responsible_id
        where e.status in ('preliminar', 'bekraftad', 'genomford')
          and b.ends_at > t0 and b.starts_at < t1
        group by e.id, t.name, t.color, c.name, pr.full_name
      ) q
    )
  );
end;
$$;

revoke execute on function screen_feed(uuid) from public;
grant execute on function screen_feed(uuid) to anon, authenticated;

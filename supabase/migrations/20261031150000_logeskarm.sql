-- Logeskärm (/loge/<nyckel>): skärm i artisternas loger med dagens schema, kamera från scenen och praktisk info.
-- Öppen utan inloggning men kräver den hemliga nyckeln i app_settings. Inställningar → Logeskärm.
-- Lämnar bara ut titel, lokaler och tider, körschemats kundsynliga punkter och logeinställningarna:
-- inga kunduppgifter, priser, antal gäster, personal eller interna anteckningar.

insert into app_settings (key, value) values
  ('loge_token', gen_random_uuid()::text),
  ('loge_camera_url', ''),
  ('loge_wifi_name', ''),
  ('loge_wifi_password', ''),
  ('loge_info_sv', E'# Praktiskt\nScenen ligger i Stora salen, en trappa upp.\nBehöver ni något? Prata med er logevärd eller med produktionen.\nRökning är inte tillåten inomhus.\nLämna inte värdesaker obevakade i logen.\n# Adress\nRörstrandsgatan 5, Stockholm\n# Vid larm\nFölj den gröna skyltningen till närmaste utgång och lyssna på personalens anvisningar.'),
  ('loge_info_en', E'# Good to know\nThe stage is in Stora salen, one floor up.\nNeed anything? Talk to your dressing room host or to production.\nSmoking is not allowed indoors.\nPlease do not leave valuables unattended in the dressing room.\n# Address\nRörstrandsgatan 5, Stockholm\n# In case of alarm\nFollow the green exit signs to the nearest exit and listen to the staff.')
on conflict (key) do nothing;

create function loge_feed(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz := date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
  t1 timestamptz := t0 + interval '1 day';
begin
  if p_token is null or p_token::text is distinct from (select value from app_settings where key = 'loge_token') then
    return null;
  end if;

  return jsonb_build_object(
    'now', now(),
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings
      where key in ('loge_camera_url', 'loge_wifi_name', 'loge_wifi_password', 'loge_info_sv', 'loge_info_en')
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x->>'start'), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'start', min(b.starts_at),
          'end', max(b.ends_at),
          'bookings', jsonb_agg(jsonb_build_object('room', r.name, 'room_en', r.name_en, 'start', b.starts_at, 'end', b.ends_at)
                                order by b.starts_at, r.sort_order),
          'run_sheet', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'starts_at', i.starts_at, 'duration_minutes', i.duration_minutes, 'title', i.title, 'who', i.who,
                     'room', ir.name, 'room_en', ir.name_en)
                   order by i.starts_at, i.created_at), '[]'::jsonb)
            from run_sheet_items i left join rooms ir on ir.id = i.room_id
            where i.event_id = e.id and i.customer_visible and i.starts_at >= t0 and i.starts_at < t1
          )
        ) as x
        from bookings b
        join events e on e.id = b.event_id
        join rooms r on r.id = b.room_id
        where e.status in ('preliminar', 'bekraftad', 'genomford')
          and b.ends_at > t0 and b.starts_at < t1
          and coalesce(b.phase, 'genomforande') = 'genomforande'
        group by e.id
      ) q
    )
  );
end;
$$;

revoke execute on function loge_feed(uuid) from public;
grant execute on function loge_feed(uuid) to anon, authenticated;

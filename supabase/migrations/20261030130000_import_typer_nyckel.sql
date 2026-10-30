-- Evenemangstyper från ShowWizrd.
insert into event_types (id, name, sort_order, color) values
  ('konferens-middag', 'Konferens+Middag', 2, '#245a82'),
  ('konferens-aw', 'Konferens+AW', 3, '#4a86b5'),
  ('event', 'Event', 8, '#b5486e')
on conflict (id) do nothing;

-- Tillfällig importväg från webbläsaren: kräver en engångsnyckel i app_settings (import_token).
-- Nyckeln tas bort när importen är klar, och då gör funktionerna ingenting.
create or replace function import_sw(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select value into v from app_settings where key = 'import_token';
  if v is null or length(v) < 32 or p_token is distinct from v then raise exception 'ogiltig nyckel'; end if;
  return import_sw_event(p);
end $$;

create or replace function import_sw_bookings(p_token text, p_ext text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v text; v_event uuid; b jsonb; v_room uuid; n int := 0;
begin
  select value into v from app_settings where key = 'import_token';
  if v is null or length(v) < 32 or p_token is distinct from v then raise exception 'ogiltig nyckel'; end if;
  select id into v_event from events where external_id = p_ext;
  if v_event is null then raise exception 'okänt evenemang'; end if;
  for b in select * from jsonb_array_elements(p) loop
    select id into v_room from rooms where lower(name) = lower(b->>'room') limit 1;
    if v_room is null then continue; end if;
    insert into bookings (event_id, room_id, starts_at, ends_at) values (v_event, v_room, (b->>'starts')::timestamptz, (b->>'ends')::timestamptz);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function import_sw(text, jsonb), import_sw_bookings(text, text, jsonb) from public;
grant execute on function import_sw(text, jsonb), import_sw_bookings(text, text, jsonb) to anon;

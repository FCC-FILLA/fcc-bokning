-- Uttryckliga rättigheter för Supabase Data API.
-- Inloggade användare når tabellerna (Row Level Security avgör sedan vad de ser).
-- Utloggade (anon) når ingenting.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fast search_path på alla egna funktioner.
alter function can_book() set search_path = public;
alter function is_admin() set search_path = public;
alter function is_member() set search_path = public;
alter function room_ancestors(uuid) set search_path = public;
alter function rooms_overlap(uuid, uuid) set search_path = public;
alter function touch_updated_at() set search_path = public;
alter function check_conflicts(uuid, timestamptz, timestamptz, uuid) set search_path = public;

-- Hjälpfunktionerna för roller ska inte kunna anropas direkt via API:t av utloggade.
revoke execute on function handle_new_user() from public, anon, authenticated;

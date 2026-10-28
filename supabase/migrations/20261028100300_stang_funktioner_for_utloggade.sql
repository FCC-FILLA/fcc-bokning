-- Funktioner är som standard körbara av alla (PUBLIC). Stäng för utloggade.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function handle_new_user() from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

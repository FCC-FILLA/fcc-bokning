-- Låst search_path på behörighetsfunktionerna (Supabase-rådgivarens varning).
alter function is_member() set search_path = public;
alter function can_manage_staff() set search_path = public;

-- Triggerfunktionen får fast search_path (säkerhetsgranskningen i Supabase).
alter function events_option_reset() set search_path = public;

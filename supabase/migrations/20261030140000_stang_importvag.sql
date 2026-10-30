-- Importen från ShowWizrd är klar: stäng den tillfälliga importvägen (nyckeln är också borttagen).
revoke execute on function import_sw(text, jsonb), import_sw_bookings(text, text, jsonb) from anon;

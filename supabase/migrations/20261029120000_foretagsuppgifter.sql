-- Företagsuppgifter (visas i offerten, PDF:en och kundlänken). Lagras i app_settings med prefixet company_.

insert into app_settings (key, value) values
  ('company_name', 'Filadelfia Convention Center'),
  ('company_legal_name', 'Filadelfia Convention Center AB'),
  ('company_orgnr', ''),
  ('company_vat_no', ''),
  ('company_address', 'Rörstrandsgatan 5'),
  ('company_postal', 'Stockholm'),
  ('company_phone', ''),
  ('company_email', ''),
  ('company_web', 'filadelfiaconventioncenter.se'),
  ('company_bankgiro', '')
on conflict (key) do nothing;

-- Kundlänken (utloggad) behöver kunna läsa just företagsuppgifterna, inget annat ur app_settings.
create or replace function public_company() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(substr(key, 9), value), '{}'::jsonb)
  from app_settings where key like 'company\_%'
$$;
revoke execute on function public_company() from public;
grant execute on function public_company() to anon, authenticated;

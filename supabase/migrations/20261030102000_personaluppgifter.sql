-- Personalens egna uppgifter: adress, närmast anhörig, lön/utbetalning, kost, klädstorlek m.m.
-- Personen fyller i själv (portalen eller den personliga länken). Personnummer och bankkonto ser bara administratörer.

create table staff_details (
  staff_id uuid primary key references staff (id) on delete cascade,
  personal_number text,          -- personnummer (känsligt)
  address text,
  postal_code text,
  city text,
  ice_name text,                 -- närmast anhörig
  ice_phone text,
  ice_relation text,
  bank_name text,
  clearing_number text,          -- känsligt
  account_number text,           -- känsligt
  tax_note text,                 -- t.ex. "Sidoinkomst 30 %" eller jämkning
  company_name text,             -- frilans med eget bolag
  org_number text,
  f_tax boolean,                 -- F-skatt
  food_preferences text,         -- specialkost/allergier som personen själv anger
  clothing_size text,
  drivers_license boolean,
  languages text,
  other text,
  updated_at timestamptz not null default now()
);
alter table staff_details enable row level security;
create policy "admin läser och skriver" on staff_details for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on staff_details to authenticated;
revoke all on staff_details from anon;

-- Planerare ser uppgifterna utan personnummer och bankkonto.
create function staff_details_basic(p_staff uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_manage_staff() then
    to_jsonb(d) - 'personal_number' - 'clearing_number' - 'account_number'
      || jsonb_build_object('has_personal_number', d.personal_number is not null, 'has_bank', d.account_number is not null)
  end
  from staff_details d where d.staff_id = p_staff
$$;
revoke execute on function staff_details_basic(uuid) from public, anon;
grant execute on function staff_details_basic(uuid) to authenticated;

-- Det personen själv ser: allt, men personnummer och kontonummer maskade.
create function staff_details_masked(p_staff uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(d) - 'personal_number' - 'clearing_number' - 'account_number'
    || jsonb_build_object(
      'personal_number_masked', case when d.personal_number is not null then left(d.personal_number, 6) || '-••••' end,
      'account_masked', case when d.account_number is not null then '•••• ' || right(d.account_number, 4) end,
      'clearing_masked', case when d.clearing_number is not null then left(d.clearing_number, 2) || '••' end)
  from staff_details d where d.staff_id = p_staff
$$;
revoke execute on function staff_details_masked(uuid) from public, anon, authenticated;

create function staff_details_save(p_staff uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into staff_details (staff_id) values (p_staff) on conflict (staff_id) do nothing;
  update staff_details set
    address = nullif(trim(coalesce(p ->> 'address', '')), ''),
    postal_code = nullif(trim(coalesce(p ->> 'postal_code', '')), ''),
    city = nullif(trim(coalesce(p ->> 'city', '')), ''),
    ice_name = nullif(trim(coalesce(p ->> 'ice_name', '')), ''),
    ice_phone = nullif(trim(coalesce(p ->> 'ice_phone', '')), ''),
    ice_relation = nullif(trim(coalesce(p ->> 'ice_relation', '')), ''),
    bank_name = nullif(trim(coalesce(p ->> 'bank_name', '')), ''),
    tax_note = nullif(trim(coalesce(p ->> 'tax_note', '')), ''),
    company_name = nullif(trim(coalesce(p ->> 'company_name', '')), ''),
    org_number = nullif(trim(coalesce(p ->> 'org_number', '')), ''),
    f_tax = (p ->> 'f_tax') = 'on',
    food_preferences = nullif(trim(coalesce(p ->> 'food_preferences', '')), ''),
    clothing_size = nullif(trim(coalesce(p ->> 'clothing_size', '')), ''),
    drivers_license = (p ->> 'drivers_license') = 'on',
    languages = nullif(trim(coalesce(p ->> 'languages', '')), ''),
    other = nullif(trim(coalesce(p ->> 'other', '')), ''),
    -- Känsliga fält skrivs bara över när något nytt anges.
    personal_number = coalesce(nullif(regexp_replace(coalesce(p ->> 'personal_number', ''), '\s', '', 'g'), ''), personal_number),
    clearing_number = coalesce(nullif(regexp_replace(coalesce(p ->> 'clearing_number', ''), '\s', '', 'g'), ''), clearing_number),
    account_number = coalesce(nullif(regexp_replace(coalesce(p ->> 'account_number', ''), '\s', '', 'g'), ''), account_number),
    updated_at = now()
  where staff_id = p_staff;
  -- Telefon och e-post ligger på personen.
  update staff set
    phone = coalesce(nullif(trim(coalesce(p ->> 'phone', '')), ''), phone),
    email = coalesce(nullif(lower(trim(coalesce(p ->> 'email', ''))), ''), email)
  where id = p_staff;
end $$;
revoke execute on function staff_details_save(uuid, jsonb) from public, anon, authenticated;

-- Inloggad personal (portalen).
create function my_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name, 'email', s.email, 'phone', s.phone, 'kind', s.kind)
    || coalesce(staff_details_masked(s.id), '{}'::jsonb)
  from staff s where s.id = my_staff_id()
$$;
create function my_details_save(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  if my_staff_id() is null then return 'okand'; end if;
  perform staff_details_save(my_staff_id(), p);
  return 'ok';
end $$;
revoke execute on function my_details(), my_details_save(jsonb) from public, anon;
grant execute on function my_details(), my_details_save(jsonb) to authenticated;

-- Frilans och leverantörer via sin personliga länk.
create function link_details(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name, 'email', s.email, 'phone', s.phone, 'kind', s.kind)
    || coalesce(staff_details_masked(s.id), '{}'::jsonb)
  from staff s where s.link_token = p_token and s.active
$$;
create function link_details_save(p_token uuid, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from staff where link_token = p_token and active;
  if v is null then return 'okand'; end if;
  perform staff_details_save(v, p);
  return 'ok';
end $$;
revoke execute on function link_details(uuid), link_details_save(uuid, jsonb) from public;
grant execute on function link_details(uuid), link_details_save(uuid, jsonb) to anon, authenticated;

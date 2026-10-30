-- Öppna och stänga huset: fasta rutiner med checklistor som den som har passet går igenom och signerar i telefonen.
-- Varje genomgång sparas med vem, när och eventuella avvikelser (bra vid brandskyddskontroller).

create table routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  title text not null,
  help text,
  sort_order int not null default 0,
  active boolean not null default true
);
create index on routine_steps (routine_id, sort_order);
create table routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines (id) on delete cascade,
  staff_id uuid references staff (id) on delete set null,
  profile_id uuid references profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  signed_name text,
  note text
);
create index on routine_runs (routine_id, started_at desc);
create table routine_checks (
  run_id uuid not null references routine_runs (id) on delete cascade,
  step_id uuid not null references routine_steps (id) on delete cascade,
  done boolean not null default true,
  note text,
  checked_at timestamptz not null default now(),
  primary key (run_id, step_id)
);

do $$
declare t text;
begin
  foreach t in array array['routines', 'routine_steps', 'routine_runs', 'routine_checks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "läs" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "planerare skriver" on %I for all to authenticated using (can_manage_staff()) with check (can_manage_staff())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

insert into routines (name, description, sort_order) values
  ('Öppna huset', 'Görs av den som öppnar, innan första gäst eller kund kommer.', 1),
  ('Stänga huset', 'Görs av den som stänger, när alla gäster har gått.', 2);
insert into routine_steps (routine_id, title, help, sort_order)
select r.id, s.title, s.help, s.ord from routines r
join (values
  ('Öppna huset', 'Larmet avslaget', null, 1),
  ('Öppna huset', 'Nödutgångar fria och olåsta', 'Inget som blockerar dörrar eller utrymningsvägar.', 2),
  ('Öppna huset', 'Brandsläckare och brandposter på plats', null, 3),
  ('Öppna huset', 'Nödbelysning och utrymningsskyltar lyser', null, 4),
  ('Öppna huset', 'Ljus tänt i entré, foajé och trapphus', null, 5),
  ('Öppna huset', 'Entrédörrar upplåsta', null, 6),
  ('Öppna huset', 'Kyl och frys har rätt temperatur', 'Kyl högst +8 °C, frys högst −18 °C. Skriv temperaturen i kommentaren.', 7),
  ('Stänga huset', 'Alla gäster och leverantörer har gått', 'Gå igenom salar, toaletter och loger.', 1),
  ('Stänga huset', 'Fönster och nödutgångar stängda', null, 2),
  ('Stänga huset', 'Kaffebryggare, spisar och strykjärn avstängda', null, 3),
  ('Stänga huset', 'Ljus släckt i salar och foajé', null, 4),
  ('Stänga huset', 'Kyl- och frysdörrar stängda', null, 5),
  ('Stänga huset', 'Ytterdörrar låsta', null, 6),
  ('Stänga huset', 'Larmet påslaget', null, 7)
) as s(routine, title, help, ord) on s.routine = r.name;

-- Rutinerna med dagens genomgångar, för en viss person.
create function routines_for(p_staff uuid, p_profile uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'description', r.description,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'help', s.help) order by s.sort_order)
                       from routine_steps s where s.routine_id = r.id and s.active), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'started_at', u.started_at, 'completed_at', u.completed_at, 'signed_name', u.signed_name,
        'mine', (u.staff_id = p_staff or u.profile_id = p_profile),
        'checks', coalesce((select jsonb_object_agg(c.step_id, jsonb_build_object('done', c.done, 'note', c.note)) from routine_checks c where c.run_id = u.id), '{}'::jsonb)
      ) order by u.started_at desc)
      from routine_runs u
      where u.routine_id = r.id and (u.started_at at time zone 'Europe/Stockholm')::date = (now() at time zone 'Europe/Stockholm')::date
    ), '[]'::jsonb)
  ) order by r.sort_order), '[]'::jsonb)
  from routines r where r.active
$$;
revoke execute on function routines_for(uuid, uuid) from public, anon, authenticated;

-- Bocka en punkt. Startar en genomgång om det inte finns en pågående för personen i dag.
create function routine_check(p_staff uuid, p_profile uuid, p_routine uuid, p_step uuid, p_done boolean, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  if p_staff is null and p_profile is null then return null; end if;
  if not exists (select 1 from routine_steps where id = p_step and routine_id = p_routine) then return null; end if;
  select id into v_run from routine_runs
  where routine_id = p_routine and completed_at is null and (staff_id = p_staff or profile_id = p_profile)
    and started_at > now() - interval '18 hours'
  order by started_at desc limit 1;
  if v_run is null then
    insert into routine_runs (routine_id, staff_id, profile_id) values (p_routine, p_staff, p_profile) returning id into v_run;
  end if;
  insert into routine_checks (run_id, step_id, done, note) values (v_run, p_step, coalesce(p_done, true), nullif(left(trim(coalesce(p_note, '')), 500), ''))
  on conflict (run_id, step_id) do update set done = excluded.done, note = excluded.note, checked_at = now();
  return v_run;
end $$;
revoke execute on function routine_check(uuid, uuid, uuid, uuid, boolean, text) from public, anon, authenticated;

-- Signera: alla punkter måste vara bockade eller ha en kommentar om avvikelsen.
create function routine_sign(p_staff uuid, p_profile uuid, p_run uuid, p_name text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare u routine_runs; v_missing int;
begin
  select * into u from routine_runs where id = p_run and (staff_id = p_staff or profile_id = p_profile) and completed_at is null;
  if u.id is null then return 'saknas'; end if;
  if coalesce(trim(p_name), '') = '' then return 'namn'; end if;
  select count(*) into v_missing from routine_steps s
  where s.routine_id = u.routine_id and s.active
    and not exists (select 1 from routine_checks c where c.run_id = u.id and c.step_id = s.id and (c.done or c.note is not null));
  if v_missing > 0 then return 'ej_klar'; end if;
  update routine_runs set completed_at = now(), signed_name = left(trim(p_name), 80), note = nullif(left(trim(coalesce(p_note, '')), 1000), '') where id = u.id;
  return 'ok';
end $$;
revoke execute on function routine_sign(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- Inloggad personal (portalen) och personliga länkar (frilans).
create function my_routines() returns jsonb language sql stable security definer set search_path = public as $$
  select routines_for((select id from staff where profile_id = auth.uid() and active), auth.uid()) $$;
create function my_routine_check(p_routine uuid, p_step uuid, p_done boolean, p_note text) returns uuid language sql security definer set search_path = public as $$
  select routine_check((select id from staff where profile_id = auth.uid() and active), auth.uid(), p_routine, p_step, p_done, p_note) $$;
create function my_routine_sign(p_run uuid, p_name text, p_note text) returns text language sql security definer set search_path = public as $$
  select routine_sign((select id from staff where profile_id = auth.uid() and active), auth.uid(), p_run, p_name, p_note) $$;
revoke execute on function my_routines(), my_routine_check(uuid, uuid, boolean, text), my_routine_sign(uuid, text, text) from public, anon;
grant execute on function my_routines(), my_routine_check(uuid, uuid, boolean, text), my_routine_sign(uuid, text, text) to authenticated;

create function link_routines(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when s.id is null then null else routines_for(s.id, null) end
  from (select (select id from staff where link_token = p_token and active and kind = 'frilans') as id) s $$;
create function link_routine_check(p_token uuid, p_routine uuid, p_step uuid, p_done boolean, p_note text) returns uuid language sql security definer set search_path = public as $$
  select routine_check((select id from staff where link_token = p_token and active and kind = 'frilans'), null, p_routine, p_step, p_done, p_note) $$;
create function link_routine_sign(p_token uuid, p_run uuid, p_name text, p_note text) returns text language sql security definer set search_path = public as $$
  select routine_sign((select id from staff where link_token = p_token and active and kind = 'frilans'), null, p_run, p_name, p_note) $$;
revoke execute on function link_routines(uuid), link_routine_check(uuid, uuid, uuid, boolean, text), link_routine_sign(uuid, uuid, text, text) from public;
grant execute on function link_routines(uuid), link_routine_check(uuid, uuid, uuid, boolean, text), link_routine_sign(uuid, uuid, text, text) to anon, authenticated;

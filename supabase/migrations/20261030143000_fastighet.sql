-- Fastighet: verktyg för fastighetstekniker och vaktmästare.
-- * Tillsyn och underhåll: återkommande kontroller (brandsläckare, nödbelysning, filter …) med intervall, logg och påminnelse.
-- * Mätarställningar: el, vatten, värme. Förbrukning mellan avläsningarna.
-- * Leverantörer och serviceavtal: vem man ringer, avtalsnummer och när avtalet går ut.

create table maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  room_id uuid references rooms (id) on delete set null,
  location text,                       -- om det inte är en bokningsbar lokal, t.ex. "Fläktrum plan 3"
  interval_days int not null default 30 check (interval_days between 1 and 3650),
  instructions text,
  assignee_id uuid references profiles (id) on delete set null,
  supplier_id uuid,                    -- sätts nedan när leverantörer finns
  last_done_on date,
  next_due_on date not null default current_date,
  notified_due_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on maintenance_tasks (next_due_on) where active;

create table maintenance_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references maintenance_tasks (id) on delete cascade,
  done_on date not null default current_date,
  done_by uuid references profiles (id) on delete set null default auth.uid(),
  done_name text,
  ok boolean not null default true,     -- false = avvikelse
  note text,
  created_at timestamptz not null default now()
);
create index on maintenance_log (task_id, done_on desc);

create table meters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'el' check (kind in ('el', 'vatten', 'varme', 'kyla', 'gas', 'annat')),
  unit text not null default 'kWh',
  location text,
  meter_no text,
  sort_order int not null default 0,
  active boolean not null default true
);
create table meter_readings (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references meters (id) on delete cascade,
  read_on date not null default current_date,
  value numeric(14, 2) not null,
  note text,
  read_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (meter_id, read_on)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,                -- t.ex. Hiss, Ventilation, Larm, Städ
  contact_name text,
  phone text,
  email text,
  emergency_phone text,     -- jour
  contract_no text,
  contract_ends_on date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table maintenance_tasks add constraint maintenance_tasks_supplier_fk foreign key (supplier_id) references suppliers (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['maintenance_tasks', 'maintenance_log', 'meters', 'meter_readings', 'suppliers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "läs" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "planerare skriver" on %I for all to authenticated using (can_manage_staff()) with check (can_manage_staff())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Utfört: logga och räkna fram nästa gång.
create function maintenance_done(p_task uuid, p_done_on date, p_ok boolean, p_note text) returns void
language plpgsql security invoker set search_path = public as $$
declare t maintenance_tasks; v_on date := coalesce(p_done_on, (now() at time zone 'Europe/Stockholm')::date);
begin
  select * into t from maintenance_tasks where id = p_task;
  if t.id is null then raise exception 'Uppgiften finns inte'; end if;
  insert into maintenance_log (task_id, done_on, done_name, ok, note)
  values (t.id, v_on, (select full_name from profiles where id = auth.uid()), coalesce(p_ok, true), nullif(left(trim(coalesce(p_note, '')), 1000), ''));
  update maintenance_tasks set last_done_on = greatest(coalesce(last_done_on, v_on), v_on),
    next_due_on = greatest(coalesce(last_done_on, v_on), v_on) + interval_days, notified_due_on = null
  where id = t.id;
end $$;
revoke execute on function maintenance_done(uuid, date, boolean, text) from public, anon;
grant execute on function maintenance_done(uuid, date, boolean, text) to authenticated;

-- Dagligen: notis om tillsyn som ska göras i dag eller är försenad (en gång per förfallodag).
-- Går till den ansvariga, annars till dem som får felanmälningar.
create function remind_maintenance() returns int
language plpgsql security definer set search_path = public as $$
declare r record; p record; n int := 0;
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_list text := coalesce((select value from app_settings where key = 'issue_notify'), '');
begin
  for r in select * from maintenance_tasks where active and next_due_on <= v_today and notified_due_on is distinct from next_due_on loop
    for p in
      select id from profiles where active and (
        id = r.assignee_id
        or (r.assignee_id is null and ((v_list <> '' and id::text = any (string_to_array(v_list, ','))) or (v_list = '' and role::text in ('admin', 'produktion'))))
      )
    loop
      perform notify_person(p.id, 'fel', format('Tillsyn att göra: %s', r.title),
        case when r.next_due_on < v_today then 'Skulle ha gjorts ' || to_char(r.next_due_on, 'YYYY-MM-DD') || '.' else 'Ska göras i dag.' end,
        '/fastighet/underhall#' || r.id, null);
    end loop;
    update maintenance_tasks set notified_due_on = r.next_due_on where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function remind_maintenance() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fcc-maintenance', '20 6 * * *', 'select public.remind_maintenance()');
  end if;
end $$;

-- Förslag på vanliga kontroller. Justera intervall och lägg till egna.
insert into maintenance_tasks (title, location, interval_days, instructions, next_due_on) values
  ('Brandsläckare: egenkontroll', 'Hela huset', 30, 'Plomb hel, manometern i grönt, skylt synlig, inget som blockerar.', current_date),
  ('Nödbelysning och utrymningsskyltar: funktionstest', 'Hela huset', 30, 'Tryck på testknappen eller bryt matningen. Alla armaturer ska lysa.', current_date),
  ('Brandlarm: provning', 'Larmcentral', 90, 'Provlarma enligt instruktionen från larmleverantören. Meddela larmcentralen före.', current_date),
  ('Utrymningsvägar och dörrstängare', 'Hela huset', 7, 'Dörrar går lätt att öppna, stänger av sig själva, inget står i vägen.', current_date),
  ('Ventilation: byte av filter', 'Fläktrum', 180, null, current_date),
  ('Hjärtstartare: kontroll av batteri och elektroder', 'Entré', 30, 'Statuslampan grön, elektroderna inom datum.', current_date),
  ('Takkrokar och riggpunkter: okulär kontroll', 'Stora salen', 365, 'Besiktning av behörig firma minst en gång per år.', current_date);

insert into meters (name, kind, unit, sort_order) values
  ('El huvudmätare', 'el', 'kWh', 1),
  ('Vatten', 'vatten', 'm³', 2),
  ('Fjärrvärme', 'varme', 'MWh', 3);

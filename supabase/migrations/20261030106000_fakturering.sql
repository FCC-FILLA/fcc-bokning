-- Fakturaunderlag per evenemang: byggs från offerterna (helt, en procentdel som förskott, eller slutfaktura där
-- tidigare fakturerat räknas av), med bilagor, och mejlas till ekonomi som PDF.

create sequence invoice_number_seq start 1001;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('invoice_number_seq'),
  event_id uuid not null references events (id) on delete cascade,
  kind text not null default 'hela' check (kind in ('hela', 'del', 'slut')),
  percent numeric(5, 2) check (percent is null or percent between 0 and 100),
  status text not null default 'utkast' check (status in ('utkast', 'skickad', 'makulerad')),
  company_id uuid references companies (id) on delete set null,
  recipient jsonb not null default '{}',          -- kunduppgifter när underlaget skapades
  customer_reference text,
  our_reference text,
  invoice_date date not null default current_date,
  due_days int not null default 30 check (due_days between 0 and 365),
  note text,                                      -- till ekonomi
  quote_ids uuid[] not null default '{}',
  pdf_path text,
  sent_at timestamptz,
  sent_to text,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on invoices (event_id);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit text,
  unit_price numeric(14, 2) not null default 0,   -- kan vara negativt (avräkning)
  vat_rate numeric(5, 2) not null default 25,
  quote_id uuid references quotes (id) on delete set null,
  sort_order int not null default 0
);
create index on invoice_lines (invoice_id);

create table invoice_attachments (
  invoice_id uuid not null references invoices (id) on delete cascade,
  document_id uuid not null references event_documents (id) on delete cascade,
  primary key (invoice_id, document_id)
);

do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_lines', 'invoice_attachments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "läs" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "bokare skriver" on %I for all to authenticated using (can_book()) with check (can_book())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
grant usage on sequence invoice_number_seq to authenticated;

-- Skickade underlag är låsta.
create function invoice_lines_locked() returns trigger
language plpgsql set search_path = public as $$
declare v uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if exists (select 1 from invoices where id = v and status <> 'utkast') then
    raise exception 'Underlaget är skickat och kan inte ändras.';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_locked before insert or update or delete on invoice_lines for each row execute function invoice_lines_locked();

-- Summa per underlag.
create view invoice_overview with (security_invoker = true) as
select i.*, e.title as event_title, c.name as company_name,
  coalesce((select sum(round(l.quantity * l.unit_price, 2)) from invoice_lines l where l.invoice_id = i.id), 0) as total_ex_vat,
  coalesce((select sum(round(l.quantity * l.unit_price * l.vat_rate / 100, 2)) from invoice_lines l where l.invoice_id = i.id), 0) as total_vat
from invoices i
join events e on e.id = i.event_id
left join companies c on c.id = i.company_id;

insert into app_settings (key, value) values ('invoice_email_to', '') on conflict (key) do nothing;

-- E-post med flera bilagor från valfri hink.
alter table email_outbox add column attachments jsonb not null default '[]';

create policy "bokare laddar upp underlag" on storage.objects for insert to authenticated
  with check (bucket_id = 'underlag' and public.can_book());
create policy "bokare läser underlag" on storage.objects for select to authenticated
  using (bucket_id = 'underlag' and public.can_book());
create policy "bokare ersätter underlag" on storage.objects for update to authenticated
  using (bucket_id = 'underlag' and public.can_book());

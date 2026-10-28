-- Lokalbilder och säljtexter, samt mallar för återkommande upplägg.

-- ---------------------------------------------------------------------------
-- Bilder och beskrivningar på lokaler (visas för kunden i offerten)
-- ---------------------------------------------------------------------------
alter table rooms add column image_path text;
alter table rooms add column sales_text text;

update rooms set image_path = '/lokaler/stora-salen.jpg',
  sales_text = 'Stockholms största konsert- och konferenssal med plats för upp till 2 100 gäster, läktare och balkong.'
  where name in ('Stora salen, hela');
update rooms set image_path = '/lokaler/stora-salen.jpg' where name in ('Parkett', 'Läktare', 'Balkong');
update rooms set image_path = '/lokaler/rorstrandssalarna.jpg',
  sales_text = 'Sju flexibla salar och två lounger som kan kombineras eller användas var för sig.'
  where name = 'Rörstrandssalarna, hela';
update rooms set image_path = '/lokaler/rorstrand-1.jpg' where name = 'Rörstrand 1';
update rooms set image_path = '/lokaler/rorstrand-2.jpg' where name = 'Rörstrand 2';
update rooms set image_path = '/lokaler/rorstrand-3.jpg' where name = 'Rörstrand 3';
update rooms set image_path = '/lokaler/rorstrand-4.jpg' where name = 'Rörstrand 4';
update rooms set image_path = '/lokaler/rorstrand-5.jpg' where name = 'Rörstrand 5';
update rooms set image_path = '/lokaler/rorstrand-6.jpg' where name = 'Rörstrand 6';
update rooms set image_path = '/lokaler/rorstrand-7.jpg' where name = 'Rörstrand 7';
update rooms set image_path = '/lokaler/lounge-1.jpg' where name = 'Lounge 1';
update rooms set image_path = '/lokaler/lounge-2.jpg' where name = 'Lounge 2';
update rooms set image_path = '/lokaler/birka.jpg',
  sales_text = 'Black box-studio för produktion, streaming och event, med plats för upp till 420 gäster.'
  where name = 'Birka';
update rooms set image_path = '/lokaler/karlbergssalen.jpg',
  sales_text = 'Ljus sal med stora fönster för konferens, middag och mingel upp till 150 gäster.'
  where name = 'Karlbergssalen';

-- Kundens offert visar nu även bilder och beskrivningar av de bokade lokalerna.
create or replace function public_quote(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'valid_until', q.valid_until,
    'intro', q.intro,
    'terms', q.terms,
    'sent_at', q.sent_at,
    'accepted_at', q.accepted_at,
    'accepted_name', q.accepted_name,
    'declined_at', q.declined_at,
    'company_name', c.name,
    'contact_name', ct.name,
    'salesperson_name', p.full_name,
    'salesperson_email', p.email,
    'event_title', e.title,
    'participants', e.participants,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id
      where b.event_id = q.event_id
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(x order by x ->> 'sort')
      from (
        select distinct on (r.id) jsonb_build_object(
          'name', r.name, 'image', coalesce(r.image_path, pr.image_path),
          'text', coalesce(r.sales_text, pr.sales_text), 'kvm', r.kvm,
          'max', (select max(capacity) from room_capacities rc where rc.room_id = r.id),
          'sort', lpad(r.sort_order::text, 5, '0')
        ) as x
        from bookings b join rooms r on r.id = b.room_id left join rooms pr on pr.id = r.parent_id
        where b.event_id = q.event_id
      ) s
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', g.name, 'group_order', g.sort_order, 'description', l.description, 'line_date', l.line_date,
        'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price,
        'discount_pct', l.discount_pct, 'vat_rate', l.vat_rate, 'kind', l.kind
      ) order by g.sort_order, l.sort_order)
      from quote_lines l join article_groups g on g.id = l.group_id
      where l.quote_id = q.id
    ), '[]'::jsonb)
  )
  from quotes q
  left join companies c on c.id = q.company_id
  left join contacts ct on ct.id = q.contact_id
  left join profiles p on p.id = q.salesperson_id
  left join events e on e.id = q.event_id
  where q.share_token = p_token
    and q.status in ('skickad', 'accepterad', 'avbojd')
$$;
revoke execute on function public_quote(uuid) from public;
grant execute on function public_quote(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mallar: lokaler och tider per dag (dag 1, dag 2 …) och offertrader
-- ---------------------------------------------------------------------------
create table event_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  event_type_id text references event_types (id),
  participants int,
  technical_info text,
  hospitality_info text,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table template_bookings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references event_templates (id) on delete cascade,
  day_offset int not null default 0 check (day_offset between 0 and 60),
  room_id uuid not null references rooms (id) on delete cascade,
  start_time time not null,
  end_time time not null,          -- före eller lika med start = slutar nästa dag
  setup_id text references setups (id),
  note text,
  sort_order int not null default 0
);
create index on template_bookings (template_id);

create table template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references event_templates (id) on delete cascade,
  group_id text not null references article_groups (id),
  article_id uuid references articles (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null default 'st',
  unit_price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  vat_rate numeric(5, 2) not null default 25,
  kind quote_line_kind not null default 'ingar',
  sort_order int not null default 0
);
create index on template_lines (template_id);

create trigger templates_touch before update on event_templates for each row execute function touch_updated_at();

alter table event_templates enable row level security;
alter table template_bookings enable row level security;
alter table template_lines enable row level security;
create policy "läs" on event_templates for select to authenticated using (is_member());
create policy "bokare skriver" on event_templates for all to authenticated using (can_book()) with check (can_book());
create policy "läs" on template_bookings for select to authenticated using (is_member());
create policy "bokare skriver" on template_bookings for all to authenticated using (can_book()) with check (can_book());
create policy "läs" on template_lines for select to authenticated using (is_member());
create policy "bokare skriver" on template_lines for all to authenticated using (can_book()) with check (can_book());
grant select, insert, update, delete on event_templates, template_bookings, template_lines to authenticated;
revoke all on event_templates, template_bookings, template_lines from anon;

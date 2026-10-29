-- Offerten får egna lokaler och tider (offererat), som syns i kalendern och i offertens program.
-- Prisraderna och lokalerna hänger inte ihop: lokalerna är programmet, raderna är priset.

create table quote_rooms (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  room_id uuid not null references rooms (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  setup_id text references setups (id),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on quote_rooms (quote_id);
create index on quote_rooms (starts_at);
alter table quote_rooms enable row level security;
create policy "läs" on quote_rooms for select to authenticated using (is_member());
create policy "bokare skriver" on quote_rooms for all to authenticated using (can_book()) with check (can_book());
grant select, insert, update, delete on quote_rooms to authenticated;
revoke all on quote_rooms from anon;

-- Programmet i offerten: offertens egna lokaler, annars evenemangets bokningar.
create function quote_program(p_quote uuid) returns table (room_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = public as $$
  select qr.room_id, qr.starts_at, qr.ends_at from quote_rooms qr where qr.quote_id = p_quote
  union all
  select b.room_id, b.starts_at, b.ends_at
  from quotes q join bookings b on b.event_id = q.event_id
  where q.id = p_quote and not exists (select 1 from quote_rooms x where x.quote_id = p_quote)
$$;

create or replace function quote_doc(p_quote uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'language', q.language,
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
    'event_type', et.name,
    -- Evenemangstypens bilder går före de allmänna (omslag och bild till textblocket).
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings
      where key like 'company\_%' or key like 'look\_%'
    ) || jsonb_strip_nulls(jsonb_build_object('look_cover', nullif(et.cover_image, ''), 'look_about_image', nullif(et.about_image, ''))),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'room', case when q.language = 'en' then coalesce(r.name_en, r.name) else r.name end,
        'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from quote_program(q.id) b join rooms r on r.id = b.room_id
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(x order by x ->> 'sort')
      from (
        select distinct on (r.id) jsonb_build_object(
          'name', case when q.language = 'en' then coalesce(r.name_en, r.name) else r.name end,
          'image', coalesce(r.image_path, pr.image_path),
          'gallery', to_jsonb(case when r.image_path is null and pr.id is not null then room_images(pr.id) else room_images(r.id) end),
          'text', case when q.language = 'en' then r.sales_text_en else r.sales_text end,
          'kvm', r.kvm,
          'max', (select max(capacity) from room_capacities rc where rc.room_id = r.id),
          'sort', lpad(r.sort_order::text, 5, '0')
        ) as x
        from quote_program(q.id) b join rooms r on r.id = b.room_id left join rooms pr on pr.id = r.parent_id
      ) s
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', case when q.language = 'en' then coalesce(g.name_en, g.name) else g.name end,
        'group_order', g.sort_order,
        -- Oförändrat artikelnamn översätts; egen text på raden lämnas som den är.
        'description', case when q.language = 'en' and a.id is not null and l.description = a.name then coalesce(a.name_en, a.name) else l.description end,
        'line_date', l.line_date,
        'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price,
        'discount_pct', l.discount_pct, 'vat_rate', l.vat_rate, 'kind', l.kind,
        'image', coalesce(a.image_path, r.image_path, pr.image_path),
        'icon', coalesce(a.icon, g.icon, 'box'),
        'text', case when q.language = 'en' then coalesce(a.description_en, r.sales_text_en) else coalesce(a.description, r.sales_text) end,
        'gallery', case when r.id is null then '[]'::jsonb else to_jsonb(room_images(r.id)) end
      ) order by g.sort_order, l.sort_order)
      from quote_lines l
      join article_groups g on g.id = l.group_id
      left join articles a on a.id = l.article_id
      left join rooms r on r.id = a.room_id
      left join rooms pr on pr.id = r.parent_id
      where l.quote_id = q.id
    ), '[]'::jsonb)
  )
  from quotes q
  left join companies c on c.id = q.company_id
  left join contacts ct on ct.id = q.contact_id
  left join profiles p on p.id = q.salesperson_id
  left join events e on e.id = q.event_id
  left join event_types et on et.id = e.event_type_id
  where q.id = p_quote
$$;

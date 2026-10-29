-- Bildbank: alla bilder som används i systemet, utbytbara på ett ställe.
-- Bilder per evenemangstyp: omslag och textblocksbild i offerten och på kundens eventsida.

create table media_images (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table media_images enable row level security;
create policy "läs" on media_images for select to authenticated using (is_member());
create policy "admin skriver" on media_images for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on media_images to authenticated;
revoke all on media_images from anon;

-- FCC:s egna foton som följer med appen.
insert into media_images (url, name, sort_order) values
  ('/lokaler/stora-salen.jpg', 'Stora salen', 1),
  ('/lokaler/rorstrandssalarna.jpg', 'Rörstrandssalarna', 2),
  ('/lokaler/rorstrand-1.jpg', 'Rörstrand 1', 3),
  ('/lokaler/rorstrand-2.jpg', 'Rörstrand 2', 4),
  ('/lokaler/rorstrand-3.jpg', 'Rörstrand 3', 5),
  ('/lokaler/rorstrand-4.jpg', 'Rörstrand 4', 6),
  ('/lokaler/rorstrand-5.jpg', 'Rörstrand 5', 7),
  ('/lokaler/rorstrand-6.jpg', 'Rörstrand 6', 8),
  ('/lokaler/rorstrand-7.jpg', 'Rörstrand 7', 9),
  ('/lokaler/lounge-1.jpg', 'Lounge 1', 10),
  ('/lokaler/lounge-2.jpg', 'Lounge 2', 11),
  ('/lokaler/birka.jpg', 'Birka', 12),
  ('/lokaler/karlbergssalen.jpg', 'Karlbergssalen', 13)
on conflict (url) do nothing;

-- Bilder som redan laddats upp och används hamnar också i banken.
insert into media_images (url, name, sort_order)
select distinct u, 'Uppladdad bild', 100
from (
  select image_path as u from rooms
  union all select unnest(gallery) from rooms
  union all select image_path from articles
  union all select value from app_settings where key in ('look_cover', 'look_logo', 'look_about_image')
) x
where u like 'http%/storage/v1/object/public/%'
on conflict (url) do nothing;

-- Bilder per evenemangstyp.
alter table event_types add column cover_image text;
alter table event_types add column about_image text;

-- Byter en bild överallt där den används.
create function replace_image(p_old text, p_new text) returns int
language plpgsql set search_path = public as $$
declare n int := 0; c int;
begin
  if not is_admin() then raise exception 'Bara administratörer kan byta bilder.'; end if;
  if p_new is null or p_new = '' or p_old = p_new then return 0; end if;
  update rooms set image_path = p_new where image_path = p_old; get diagnostics c = row_count; n := n + c;
  update rooms set gallery = array_replace(gallery, p_old, p_new) where p_old = any (gallery); get diagnostics c = row_count; n := n + c;
  update articles set image_path = p_new where image_path = p_old; get diagnostics c = row_count; n := n + c;
  update app_settings set value = p_new, updated_at = now() where value = p_old and key like 'look\_%'; get diagnostics c = row_count; n := n + c;
  update event_types set cover_image = p_new where cover_image = p_old; get diagnostics c = row_count; n := n + c;
  update event_types set about_image = p_new where about_image = p_old; get diagnostics c = row_count; n := n + c;
  update media_images set url = p_new where url = p_old;
  return n;
end $$;
revoke execute on function replace_image(text, text) from public, anon;
grant execute on function replace_image(text, text) to authenticated;

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
      from bookings b join rooms r on r.id = b.room_id
      where b.event_id = q.event_id
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
        from bookings b join rooms r on r.id = b.room_id left join rooms pr on pr.id = r.parent_id
        where b.event_id = q.event_id
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


-- Kundens eventlänk: typens omslag går före det allmänna.
create or replace function event_portal(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'status', e.status,
    'event_type', et.name,
    'participants', e.participants,
    'description', e.description,
    'technical_info', e.technical_info,
    'hospitality_info', e.hospitality_info,
    'company_name', c.name,
    'contact_name', ct.name,
    'responsible_name', p.full_name,
    'responsible_email', p.email,
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings where key like 'company\_%' or key like 'look\_%')
      || jsonb_strip_nulls(jsonb_build_object('look_cover', nullif(et.cover_image, ''), 'look_about_image', nullif(et.about_image, ''))),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', q.number, 'title', q.title, 'status', q.status, 'share_token', q.share_token,
        'sent_at', q.sent_at, 'accepted_at', q.accepted_at, 'valid_until', q.valid_until,
        'total_ex_vat', (select coalesce(sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2)), 0) from quote_lines l where l.quote_id = q.id and l.kind = 'ingar')
      ) order by q.number desc)
      from quotes q where q.event_id = e.id and q.status in ('skickad', 'accepterad', 'avbojd')
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'title', k.title, 'note', k.note, 'due_date', k.due_date,
        'can_check', k.customer_can_check, 'done_at', k.done_at, 'done_by', k.done_by
      ) order by k.due_date nulls last, k.sort_order)
      from event_checklist k where k.event_id = e.id and k.customer_visible
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'mime', d.mime, 'size', d.size_bytes, 'url', d.url, 'created_at', d.created_at) order by d.created_at desc)
      from event_documents d where d.event_id = e.id and d.public
    ), '[]'::jsonb)
  )
  from events e
  left join event_types et on et.id = e.event_type_id
  left join companies c on c.id = e.company_id
  left join contacts ct on ct.id = e.contact_id
  left join profiles p on p.id = e.responsible_id
  where e.share_token = p_token
    and (e.portal_enabled or e.status in ('bekraftad', 'genomford'))
$$;

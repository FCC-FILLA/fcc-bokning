-- Bilder, ikoner och kundtexter på artiklar, så att varje offertrad kan visas som ett kort.

alter table article_groups add column icon text not null default 'box';
alter table articles add column icon text;        -- null = gruppens ikon
alter table articles add column image_path text;  -- egen bild; annars den kopplade lokalens bild
-- articles.description finns redan och används som text till kunden.

update article_groups set icon = case id
  when 'lokal' then 'room' when 'biljett' then 'ticket' when 'teknik' then 'tech' when 'mat' then 'meal'
  when 'ovrigt' then 'person' when 'tillagg' then 'box' when 'expo' then 'power' else 'box' end;

-- Ikon efter namn. Första träffen vinner, så de mer specifika orden står först.
update articles set icon = case
  when name ilike 'Tält%' then 'tent'
  when name ~* 'säkerhet|ordningsvakt|visitation|kravall' then 'security'
  when name ilike '%brandvakt%' then 'fire'
  when name ilike '%garderob%' then 'coat'
  when name ~* 'handduk|sänglinne' then 'bed'
  when name ~* 'kanot|roddbåt' then 'boat'
  when name ilike '%bastu%' then 'sauna'
  when name ilike '%extra timmar%' then 'clock'
  when name ilike '%städ%' then 'clean'
  when name ~* 'rabatt' then 'discount'
  when name ~* 'block och penna|förskott|administrat|avräkning|serveringsavgift' then 'document'
  when name ~* 'mingel|snacks|tilltugg|vickning' then 'mingle'
  when name ~* '^bar:|dryck|vin |vin\(|öl |cider|mousserande|läsk' then 'drink'
  when name ~* 'kaffe|fika' then 'coffee'
  when name ~* 'lunch|middag|frukost|konferenspaket|wrap|specialkost|provsmak|kök|riggvagn|specialpaket' then 'meal'
  when name ~* 'logevärd|logearr|konferensvärd' then 'host'
  when name ~* 'möblering|plattform' then 'chair'
  when name ~* 'scen|stagehand|podie' then 'stage'
  when name ~* 'streaming|länk|vimeo|zoom|teams' then 'broadcast'
  when name ~* 'ljuspaket|ljustekniker' then 'light'
  when name ~* 'mikrofon|iem|inspelning' then 'mic'
  when name ~* 'ljudpaket|ljudtekniker|högtalare' then 'sound'
  when name ~* 'kamera|steady|video|bildproducent' then 'camera'
  when name ~* 'tv|monitor|projektor|led-banner|bildpaket|bildtekniker' then 'screen'
  when name ~* 'ström' then 'power'
  when name ~* 'internet' then 'wifi'
  when name ~* 'sop|gods' then 'box'
  when name ~* 'teknik|tekniker|backline|material' then 'tech'
  when name ~* 'projektledare|personal' then 'person'
  else null end;

-- "Rörstrand 1-7" är hela Rörstrandssalarna och får deras bilder.
update articles set room_id = (select id from rooms where name = 'Rörstrandssalarna, hela')
  where name = 'Rörstrand 1-7' and room_id is null;

-- FCC:s egna texter för Birka och Karlberg.
update rooms set sales_text = 'En trappa ner från entréplan hittar du Birkasalen. Perfekt som konferenssal, mingelyta, streaming eller efterfestlokal. Birka tar upp emot 350 gäster.'
  where name = 'Birka';
update rooms set sales_text = 'En trappa ner från entréplan hittar du Karlberssalen. Perfekt som konferenssal, breakoutrum eller utställningsyta. Karlberg tar upp emot 150 gäster.'
  where name = 'Karlbergssalen';
update articles set description = 'Förmiddagsfika, lunch och eftermiddagsfika.' where name = 'Konferenspaket heldag' and description is null;
update articles set description = 'Tekniker 10 h, därefter löpande timdebitering. Se separat dokument för specifikation.'
  where name like 'Grundpaket Teknik - %' and description is null;

-- ---------------------------------------------------------------------------
-- Bild, galleri, ikon och text per offertrad. Lokalartiklar ärver lokalens bild
-- och text; galleriet är lokalen plus dess dellokaler. Rader utan artikel får gruppens ikon.
-- ---------------------------------------------------------------------------
create or replace function line_media(p_article uuid, p_group text)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'image', coalesce(a.image_path, r.image_path, pr.image_path),
    'icon', coalesce(a.icon, g.icon, 'box'),
    'text', coalesce(a.description, r.sales_text),
    'gallery', coalesce((
      select jsonb_agg(distinct x.image_path)
      from rooms x where x.image_path is not null and r.id is not null and (x.id = r.id or x.parent_id = r.id)
    ), '[]'::jsonb)
  )
  from article_groups g
  left join articles a on a.id = p_article
  left join rooms r on r.id = a.room_id
  left join rooms pr on pr.id = r.parent_id
  where g.id = p_group
$$;
revoke execute on function line_media(uuid, text) from public, anon;
grant execute on function line_media(uuid, text) to authenticated;

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
          'text', r.sales_text, 'kvm', r.kvm,
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
      ) || line_media(l.article_id, l.group_id) order by g.sort_order, l.sort_order)
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
-- Uppladdade artikelbilder. Publik läsning (bilderna visas för kunder), bara admin skriver.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artiklar', 'artiklar', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin laddar upp artikelbilder" on storage.objects for insert to authenticated
  with check (bucket_id = 'artiklar' and public.is_admin());
create policy "admin ändrar artikelbilder" on storage.objects for update to authenticated
  using (bucket_id = 'artiklar' and public.is_admin());
create policy "admin tar bort artikelbilder" on storage.objects for delete to authenticated
  using (bucket_id = 'artiklar' and public.is_admin());

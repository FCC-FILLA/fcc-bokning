-- Flera bilder per lokal. image_path är huvudbilden, gallery fler bilder i ordning.
alter table rooms add column gallery text[] not null default '{}';

-- Alla bilder för en lokal i visningsordning: huvudbild, egna extrabilder, sedan dellokalernas huvudbilder.
-- Dubbletter tas bort, första förekomsten vinner.
create or replace function room_images(p_room uuid) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(p order by o), '{}')
  from (
    select p, min(o) as o
    from unnest(
      (select array[r.image_path] || r.gallery from rooms r where r.id = p_room)
      || array(select x.image_path from rooms x where x.parent_id = p_room and x.active and x.image_path is not null order by x.sort_order)
    ) with ordinality as t(p, o)
    where p is not null and p <> ''
    group by p
  ) s
$$;
revoke execute on function room_images(uuid) from public, anon;
grant execute on function room_images(uuid) to authenticated;

create or replace function line_media(p_article uuid, p_group text)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'image', coalesce(a.image_path, r.image_path, pr.image_path),
    'icon', coalesce(a.icon, g.icon, 'box'),
    'text', coalesce(a.description, r.sales_text),
    'gallery', case when r.id is null then '[]'::jsonb else to_jsonb(room_images(r.id)) end
  )
  from article_groups g
  left join articles a on a.id = p_article
  left join rooms r on r.id = a.room_id
  left join rooms pr on pr.id = r.parent_id
  where g.id = p_group
$$;

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
          'gallery', to_jsonb(case when r.image_path is null and pr.id is not null then room_images(pr.id) else room_images(r.id) end),
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

-- Uppladdade lokalbilder. Publik läsning, bara admin skriver.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lokaler', 'lokaler', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin laddar upp lokalbilder" on storage.objects for insert to authenticated
  with check (bucket_id = 'lokaler' and public.is_admin());
create policy "admin ändrar lokalbilder" on storage.objects for update to authenticated
  using (bucket_id = 'lokaler' and public.is_admin());
create policy "admin tar bort lokalbilder" on storage.objects for delete to authenticated
  using (bucket_id = 'lokaler' and public.is_admin());

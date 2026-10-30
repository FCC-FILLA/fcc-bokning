-- Möbelnamn och färger följer med ritningarna till personalens pass (personalen kan inte läsa furniture_types direkt).
create or replace function event_staff_info(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', e.title,
    'participants', e.participants,
    'description', e.description,
    'technical_info', e.technical_info,
    'hospitality_info', e.hospitality_info,
    'staff_info', e.staff_info,
    'responsible_name', p.full_name,
    'responsible_email', p.email,
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object('room', r.name, 'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id where b.event_id = e.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'url', d.url) order by d.created_at desc)
      from event_documents d where d.event_id = e.id and d.staff
    ), '[]'::jsonb),
    'layouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'room', r.name, 'notes', l.notes, 'items', l.items, 'plan', r.plan, 'kvm', r.kvm,
        'starts_at', b.starts_at
      ) order by b.starts_at nulls last, l.name)
      from layouts l join rooms r on r.id = l.room_id left join bookings b on b.id = l.booking_id
      where l.event_id = e.id and l.staff_visible
    ), '[]'::jsonb),
    'furniture', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'color', f.color, 'sort_order', f.sort_order))
      from furniture_types f
      where exists (select 1 from layouts l where l.event_id = e.id and l.staff_visible)
    ), '[]'::jsonb)
  )
  from events e left join profiles p on p.id = e.responsible_id
  where e.id = p_event
$$;

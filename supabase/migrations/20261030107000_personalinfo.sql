-- Infoflik för personalen: fasta block från kontoret (entré, koder, personalmat, klädsel …) och info per evenemang.
-- Block kan riktas till internpersonal, frilans och/eller leverantörer, och kan döljas tills personen har ett pass nära i tid
-- (t.ex. dörrkoder).

create table staff_info (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  icon text,
  audience text[] not null default '{intern,frilans,leverantor}',
  only_when_booked boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
alter table staff_info enable row level security;
create policy "läs" on staff_info for select to authenticated using (is_member());
create policy "planerare skriver" on staff_info for all to authenticated using (can_manage_staff()) with check (can_manage_staff());
grant select, insert, update, delete on staff_info to authenticated;
revoke all on staff_info from anon;

insert into staff_info (title, body, icon, sort_order, only_when_booked) values
  ('Hitta hit och entré', 'Personalentrén ligger på … Ring på … om dörren är låst.', 'room', 1, false),
  ('Koder', 'Dörrkod personalentré: …
Larmkod: …', 'security', 2, true),
  ('Personalmat', 'Personalmat serveras … i …', 'meal', 3, false),
  ('Klädsel', 'Svarta kläder och bekväma skor. Namnbricka hämtas i …', 'coat', 4, false),
  ('Vid problem', 'Ring dagens ansvarige. Vid nödläge: 112.', 'person', 5, false);

alter table events add column staff_info text;   -- info till personalen för just det här evenemanget

-- Blocken en person får se: rätt målgrupp, och "bara när bokad" kräver ett pass som börjar inom 36 timmar eller pågår.
create function staff_info_for(p_staff uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'icon', i.icon) order by i.sort_order, i.title), '[]'::jsonb)
  from staff s cross join staff_info i
  where s.id = p_staff and s.active
    and s.kind::text = any (i.audience)
    and (not i.only_when_booked or exists (
      select 1 from shift_assignments a join shifts sh on sh.id = a.shift_id
      where a.staff_id = s.id and a.status = 'tilldelad'
        and sh.starts_at < now() + interval '36 hours' and sh.ends_at > now() - interval '2 hours'
    ))
$$;
revoke execute on function staff_info_for(uuid) from public, anon, authenticated;

create function my_staff_info() returns jsonb
language sql stable security definer set search_path = public as $$ select staff_info_for(my_staff_id()) $$;
create function link_staff_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select staff_info_for(id) from staff where link_token = p_token and active
$$;
revoke execute on function my_staff_info(), link_staff_info(uuid) from public;
grant execute on function my_staff_info() to authenticated;
grant execute on function link_staff_info(uuid) to anon, authenticated;

-- Evenemangets egen personalinfo följer med till passen.
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
    ), '[]'::jsonb)
  )
  from events e left join profiles p on p.id = e.responsible_id
  where e.id = p_event
$$;


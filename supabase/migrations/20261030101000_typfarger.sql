-- Färg per evenemangstyp (kalendern och listor).
alter table event_types add column color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
update event_types set color = case id
  when 'konferens' then '#2f6f9f'
  when 'konsert' then '#8e3b8f'
  when 'tv' then '#c0612b'
  when 'middag' then '#2f8f5b'
  when 'forsamling' then '#9a7b12'
  when 'kaggeholm' then '#4f6b2f'
  when 'hybrid' then '#3b5bb5'
  else '#6b6b6b' end
where color is null;

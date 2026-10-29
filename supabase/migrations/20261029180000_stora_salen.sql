-- Stora salen är en lokal. Parkett, Läktare och Balkong tas bort som egna lokaler.
do $$
declare hel uuid := (select id from rooms where name = 'Stora salen, hela');
begin
  update bookings set room_id = hel where room_id in (select id from rooms where name in ('Parkett', 'Läktare', 'Balkong'));
  update template_bookings set room_id = hel where room_id in (select id from rooms where name in ('Parkett', 'Läktare', 'Balkong'));
  update shifts set room_id = hel where room_id in (select id from rooms where name in ('Parkett', 'Läktare', 'Balkong'));
  update articles set room_id = hel where room_id in (select id from rooms where name in ('Parkett', 'Läktare', 'Balkong'));
  delete from rooms where name in ('Parkett', 'Läktare', 'Balkong');
  update rooms set name = 'Stora salen', name_en = 'Main Hall' where id = hel;
end $$;

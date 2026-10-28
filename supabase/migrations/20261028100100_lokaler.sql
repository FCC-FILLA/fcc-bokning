-- Grunddata: anläggning, lokaler, möbleringar, kapacitet och evenemangstyper.
-- Kapacitet från "Kapacitet i korthet" på filadelfiaconventioncenter.se.
-- Kontrollrum och kök kommer från ShowWizrd.

insert into setups (id, name, sort_order) values
  ('bio', 'Biosittning', 1),
  ('skol', 'Skolsittning', 2),
  ('styrelse', 'Styrelse', 3),
  ('langbord', 'Långbord', 4),
  ('runda', 'Runda bord', 5),
  ('staende', 'Stående', 6),
  ('hybrid', 'Hybridevent', 7);

insert into event_types (id, name, sort_order) values
  ('konferens', 'Konferens', 1),
  ('konsert', 'Konsert', 2),
  ('tv', 'TV/produktion', 3),
  ('middag', 'Middag/fest', 4),
  ('forsamling', 'Församling', 5),
  ('kaggeholm', 'Kaggeholm', 6),
  ('ovrigt', 'Övrigt', 9);

do $$
declare
  s uuid;
  stora uuid;
  rors uuid;
  r uuid;
begin
  insert into sites (name, address, sort_order)
  values ('Filadelfia Rörstrand', 'Rörstrandsgatan 5, Stockholm', 1)
  returning id into s;

  -- Stora salen
  insert into rooms (site_id, name, kvm, sort_order) values (s, 'Stora salen, hela', 1350, 10) returning id into stora;
  insert into room_capacities values
    (stora, 'bio', 1900), (stora, 'skol', 300), (stora, 'langbord', 540),
    (stora, 'runda', 440), (stora, 'staende', 2100), (stora, 'hybrid', 1600);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values
    (s, stora, 'Parkett', 550, 11),
    (s, stora, 'Läktare', 400, 12),
    (s, stora, 'Balkong', 380, 13);

  -- Rörstrandssalarna
  insert into rooms (site_id, name, kvm, note, sort_order)
  values (s, 'Rörstrandssalarna, hela', 500, 'Inkl. Lounge 1 och 2', 20) returning id into rors;
  insert into room_capacities values
    (rors, 'bio', 420), (rors, 'skol', 200), (rors, 'langbord', 360),
    (rors, 'runda', 230), (rors, 'staende', 650);

  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 1', 125, 21) returning id into r;
  insert into room_capacities values (r, 'bio', 150), (r, 'skol', 70), (r, 'styrelse', 36), (r, 'langbord', 100), (r, 'runda', 90);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 2', 50, 22) returning id into r;
  insert into room_capacities values (r, 'bio', 30), (r, 'skol', 30), (r, 'styrelse', 30), (r, 'langbord', 30), (r, 'runda', 30);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 3', 50, 23) returning id into r;
  insert into room_capacities values (r, 'bio', 90), (r, 'skol', 42), (r, 'styrelse', 39), (r, 'langbord', 60), (r, 'runda', 40);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 4', 10, 24) returning id into r;
  insert into room_capacities values (r, 'styrelse', 8), (r, 'langbord', 8);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 5', 10, 25) returning id into r;
  insert into room_capacities values (r, 'styrelse', 8), (r, 'langbord', 8);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 6', 7, 26) returning id into r;
  insert into room_capacities values (r, 'styrelse', 4), (r, 'langbord', 4);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Rörstrand 7', 50, 27) returning id into r;
  insert into room_capacities values (r, 'bio', 90), (r, 'skol', 42), (r, 'styrelse', 39), (r, 'langbord', 60), (r, 'runda', 40);
  insert into rooms (site_id, parent_id, name, kvm, sort_order) values (s, rors, 'Lounge 1', 130, 28) returning id into r;
  insert into room_capacities values (r, 'staende', 120);
  insert into rooms (site_id, parent_id, name, kvm, kvm_note, sort_order) values (s, rors, 'Lounge 2', 65, 'Halv lounge, hel 115 kvm', 29) returning id into r;
  insert into room_capacities values (r, 'bio', 72), (r, 'staende', 100);

  -- Övriga lokaler
  insert into rooms (site_id, name, kvm, sort_order) values (s, 'Birka', 310, 30) returning id into r;
  insert into room_capacities values
    (r, 'bio', 350), (r, 'skol', 200), (r, 'styrelse', 50), (r, 'langbord', 220),
    (r, 'runda', 190), (r, 'staende', 420), (r, 'hybrid', 250);
  insert into rooms (site_id, name, kvm, sort_order) values (s, 'Karlbergssalen', 120, 40) returning id into r;
  insert into room_capacities values
    (r, 'bio', 150), (r, 'skol', 80), (r, 'styrelse', 45), (r, 'langbord', 130), (r, 'runda', 80), (r, 'staende', 150);

  insert into rooms (site_id, name, sort_order) values
    (s, 'Kontrollrum', 50),
    (s, 'Kök Rörstrand', 60),
    (s, 'Kök Karlberg', 61);
end $$;

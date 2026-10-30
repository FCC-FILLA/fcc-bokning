-- FCC:s egna möbler enligt inventarielistan (2026-10-30), plus leverantör för inhyrda möbler (t.ex. Westmans).
alter table furniture_types add column supplier text;   -- null = eget lager
alter table furniture_types add column note text;

-- Typer vi inte äger döljs (finns kvar för gamla ritningar).
update furniture_types set active = false where id in ('rund180', 'rund120', 'bord120', 'skolbord');

update furniture_types set name = 'Stol', stock = 800 where id = 'stol';
update furniture_types set name = 'Träbord 180×80', stock = 20 where id = 'bord180';
update furniture_types set name = 'Runt bord Ø150', stock = 20, default_chairs = 8, max_chairs = 10 where id = 'rund150';
update furniture_types set name = 'Ståbord Ø70', stock = 6 where id = 'stabord';
update furniture_types set name = 'Talarbord (trä)', stock = 1, width_m = 0.6, depth_m = 0.6 where id = 'talarstol';

insert into furniture_types (id, name, shape, width_m, depth_m, default_chairs, max_chairs, stock, color, sort_order) values
  ('plastbord',     'Plastbord 182×75',   'rect',  1.82, 0.75, 6, 6, 20, null,      5),
  ('stabord80',     'Ståbord Ø80',        'round', 0.8,  0.8,  0, 0, 36, '#d9cfc4', 8),
  ('talarbord60',   'Talarbord Ø60',      'round', 0.6,  0.6,  0, 0, 6,  '#3b3436', 10),
  ('barstol',       'Barstol',            'chair', 0.45, 0.45, 0, 0, 6,  null,      16),
  ('studiofatolj',  'Studiofåtölj',       'rect',  0.75, 0.75, 0, 0, 6,  '#6b6466', 17),
  ('studiofatolj2', 'Studiofåtölj, rosa', 'rect',  0.8,  0.8,  0, 0, 4,  '#e2b7b0', 18),
  ('studiobord',    'Studiobord',         'round', 0.6,  0.6,  0, 0, 1,  '#c9a66b', 19),
  ('soffa',         'Soffa',              'rect',  2.2,  0.9,  0, 0, 6,  '#cfc8c0', 20),
  ('soffbord',      'Soffbord',           'rect',  1.2,  0.6,  0, 0, 4,  '#c9a66b', 21);

-- Fasta delar sorteras sist.
update furniture_types set sort_order = sort_order + 20 where shape = 'fixed';

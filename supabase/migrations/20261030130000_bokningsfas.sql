-- Fas per bokning: bygg, genomförande eller riv. Används i matrisvyn och serierna på evenemanget.
-- Befintliga bokningar blir "genomforande".
alter table bookings
  add column if not exists phase text not null default 'genomforande'
  check (phase in ('bygg', 'genomforande', 'riv'));

alter table template_bookings
  add column if not exists phase text not null default 'genomforande'
  check (phase in ('bygg', 'genomforande', 'riv'));

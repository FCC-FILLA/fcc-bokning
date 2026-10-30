-- Anställningsnummer för löneunderlaget (kolumnen "Anställningsnr" i lönesystemets import).
alter table staff add column if not exists employment_number text;

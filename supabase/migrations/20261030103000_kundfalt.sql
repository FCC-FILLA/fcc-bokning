-- Fler kunduppgifter (som i ShowWizrd) och kategorier, samt id från importen så att den kan köras igen utan dubbletter.
alter table companies add column address text;
alter table companies add column postal_code text;
alter table companies add column city text;
alter table companies add column country text;
alter table companies add column website text;
alter table companies add column invoice_email text;
alter table companies add column categories text[] not null default '{}';
alter table companies add column external_id text unique;
alter table contacts add column external_key text unique;
create index on companies using gin (categories);

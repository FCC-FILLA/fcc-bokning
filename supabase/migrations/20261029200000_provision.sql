-- Provision per kund: påminnelse när man gör offert och med i den interna kalkylen.
alter table companies add column commission_pct numeric(5, 2) check (commission_pct between 0 and 100);
alter table companies add column commission_to text;
alter table companies add column commission_note text;

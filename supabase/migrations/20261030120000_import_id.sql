-- Id från ShowWizrd-importen, så att den kan köras igen utan dubbletter.
alter table events add column external_id text unique;
alter table quotes add column external_id text unique;

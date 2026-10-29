-- Justering av automatiskt valda ikoner.
update articles set icon = 'chair' where name ilike 'Möblering:%';
update articles set icon = 'meal' where name ~* 'middag inkl\. dryckespaket|^wrap';
update articles set icon = 'ticket' where name ilike 'Biljettkontroll%';

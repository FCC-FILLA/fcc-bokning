-- Projektmappar i Google Drive: Huvudmapp / Kund / År / "ÅÅÅÅ-MM-DD Evenemang".
-- events.drive_folder_id finns sedan tidigare. Kundens mapp sparas så att den återanvänds även om kunden byter namn.
alter table companies add column if not exists drive_folder_id text;

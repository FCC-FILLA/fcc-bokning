# Idéer och kommande arbete

Saker som är bestämda men inte klara. Senast uppdaterad 2026-10-29.

## Byggt (2026-10-29)
- Eventlänk för kunden: /event/<token>, öppen när evenemanget är bekräftat (eller tidigare om vi väljer det).
  Program, offerter, checklista som kunden kan bocka av, publika dokument och kontakt.
- Dokument på evenemanget: uppladdning, dolda för kunden som standard, synliga för personal som standard.
- Personal ser evenemangsinformation i portalen och på den personliga länken, utan ekonomi.
- E-postkö med utskick via Resend (funktionen send-mail) och tidsunderlag i Excel som mejlas när en månad låses.

## Projektmapp i Google Drive per evenemang
- Varje evenemang skapar automatiskt en mapp i Google Drive (projektmapp), där dokumenten sparas.
- Dold för kunden som standard; enskilda dokument kan göras publika på eventlänken.
- Kräver koppling till FCC:s Google Workspace (gemensam enhet och ett tjänstkonto). Kolumnerna drive_folder_id och drive_file_id finns redan.

## Övrigt som väntar
- E-post: Resend-konto, DNS för mail.filadelfiacc.se och hemligheten RESEND_API_KEY i Supabase. Därefter skickas kön automatiskt.

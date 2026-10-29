# Idéer och kommande arbete

Saker som är bestämda men inte klara. Senast uppdaterad 2026-10-29.

## Byggt (2026-10-29)
- Eventlänk för kunden: /event/<token>, öppen när evenemanget är bekräftat (eller tidigare om vi väljer det).
  Program, offerter, checklista som kunden kan bocka av, publika dokument och kontakt.
- Dokument på evenemanget: uppladdning, dolda för kunden som standard, synliga för personal som standard.
- Personal ser evenemangsinformation i portalen och på den personliga länken, utan ekonomi.
- E-postkö med utskick via Resend (funktionen send-mail) och tidsunderlag i Excel som mejlas när en månad låses.

## Byggt (2026-10-29, kväll)
- Flikar på evenemanget (Allmänt, Program och lokaler, Genomförande, Ekonomi, Personal).
- Bildbank (Inställningar → Bilder) och bilder per evenemangstyp.
- Optioner i turordning: obekräftade på samma tid krockar inte, de står i kö.
- Notiser (klocka, appnotis, e-post) och pass som saknar personal på översikten.
- E-post via Resend är igång (mail.filadelfiacc.se verifierad).

## Projektmapp i Google Drive per evenemang (nästa)
- Varje evenemang skapar automatiskt en mapp i Google Drive (projektmapp), där dokumenten sparas.
- Dold för kunden som standard; enskilda dokument kan göras publika på eventlänken.
- Kräver koppling till FCC:s Google Workspace (gemensam enhet och ett tjänstkonto). Kolumnerna drive_folder_id och drive_file_id finns redan.

## Övrigt som väntar
- Google Drive, plan: gemensam enhet "FCC Projekt", Cloud-projekt med Drive API, tjänstkonto (Pontus skapar konto och nyckel själv),
  nyckeln i Vercel som GOOGLE_SERVICE_ACCOUNT_JSON. Öppen fråga: mapp per år eller direkt i enheten?
- Svarsadress för e-post är inte satt (Inställningar → E-post).

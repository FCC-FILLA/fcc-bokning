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

## Byggt natten till 2026-10-30
- Översikt: kommande veckans evenemang, knapp Nytt arbetspass, senaste notiser, pass som saknar personal.
- Kalender: tänd/släck evenemangstyper, färg per typ, evenemang på personalpass, offererade lokaler (streckade).
- Lounge 1 och 2 egna lokaler.
- Personalens egna uppgifter (adress, ICE, lön, F-skatt, kost …) i portalen och på länken; känsligt bara för admin.
- Offerter med egna lokaler och tider; boka dem på evenemanget med en knapp. Inga automatiska prisrader från bokningar.
- Uppgifter: ansvarig, dagar före evenemanget, daglig påminnelse kl 07, sidan Mina uppgifter.
- Fakturaunderlag: förskott i procent, slutfaktura med avräkning, PDF + bilagor till ekonomi.
- Sorterbara kolumner (kunder, evenemang, offerter, personer, fakturaunderlag).
- 496 kunder och 220 kontakter importerade från ShowWizrd, med kategorier. Org.nr-sök via Bolagsverket (väntar på nyckel).
- Bra att veta för personalen (koder visas bara nära ett pass) och Till personalen per evenemang.

## Projektmapp i Google Drive per evenemang (nästa)
- Varje evenemang skapar automatiskt en mapp i Google Drive (projektmapp), där dokumenten sparas.
- Dold för kunden som standard; enskilda dokument kan göras publika på eventlänken.
- Kräver koppling till FCC:s Google Workspace (gemensam enhet och ett tjänstkonto). Kolumnerna drive_folder_id och drive_file_id finns redan.

## Övrigt som väntar
- Google Drive, plan: gemensam enhet "FCC Projekt", Cloud-projekt med Drive API, tjänstkonto (Pontus skapar konto och nyckel själv),
  nyckeln i Vercel som GOOGLE_SERVICE_ACCOUNT_JSON. Öppen fråga: mapp per år eller direkt i enheten?
- Svarsadress för e-post är inte satt (Inställningar → E-post).
- Adress för fakturaunderlag är inte satt (Inställningar → E-post).
- Bolagsverket: registrera API-konto, lägg BOLAGSVERKET_CLIENT_ID och BOLAGSVERKET_CLIENT_SECRET i Vercel.
- Fyll i texterna under Personal → Info till personalen (entré, koder, personalmat).

# FCC Bokning

Internt bokningssystem för Filadelfia Convention Center: lokaler, kunder, evenemang, bokningar per lokal och tidslucka, och krockkontroll.

**Teknik:** Next.js 16 (App Router), Supabase (Postgres, inloggning, behörigheter), Tailwind CSS. Körs på Vercel.

## Det som finns i fas 1

Menyn är uppdelad i sektioner med underflikar: **Översikt**, **Kalender** (vecka, månad, dagsblad, ledig lokal, krockar), **Evenemang** (alla evenemang, mallar), **Försäljning** (offerter, kunder) och **Inställningar** (lokaler, prislista, offerttexter, användare, mitt konto). Menyn definieras i `src/components/nav.tsx`.

- **Översikt** (startsidan): idag och i morgon, sådant som kräver åtgärd, beläggning två veckor framåt, offerter som väntar på svar och senaste ändringar.
- **Vecka och månad:** vecka för vecka med en rad per lokal (klicka i en tom ruta för att boka), och en månadsvy.
- **Evenemang:** status (förfrågan, preliminär med optionsdatum, bekräftad, genomförd, avbokad), kund, kontakt, ansvarig, deltagare, teknik, hospitality och interna anteckningar.
- **Bokningar:** ett evenemang kan ha många bokningar (lokal + tid). Återkommande bokningar skapas veckovis.
- **Krockkontroll:** lokalerna ligger i ett träd. Bokas *Stora salen, hela* blockeras Parkett, Läktare och Balkong, och tvärtom. Krockar visas i schemat, på evenemanget och under *Krockar*.
- **Hitta ledig lokal** (`/ledigt`): lediga salar för datum, tid, antal dagar, gäster och möblering, med bokningsknapp.
- **Dagsblad** (`/dagsblad`): utskriftsvänlig dagsöversikt för produktion och värdar.
- **Sök** i menyn: evenemang, offerter (även offertnummer), kunder och kontaktpersoner.
- **Historik** på evenemang och offerter: vem som ändrade vad och när (databastriggers i `audit_log`).
- **Kalenderprenumeration** (`/konto`): personlig iCal-länk för Outlook, Google och iPhone. Slutar fungera om användaren stängs av.
- **Användare** (`/anvandare`, admin): roller, namn och aktiv/avstängd.
- **Mallar** (`/mallar`): återkommande upplägg med lokaler och tider dag för dag (dag 1, dag 2 …) och offertrader. Skapa ett evenemang, och gärna ett offertutkast, från mallen med ett startdatum. Ett befintligt evenemang kan sparas som mall.
- **Lokaler** (`/lokaler/<id>`): namn (även engelska), överordnad lokal, kvm, kapacitet per möblering, säljtext på svenska och engelska och flera bilder per lokal (huvudbild plus bildspel). Uppladdade bilder ligger i hinken `lokaler`.
- **Offert på engelska:** språk väljs per offert. Kundsidan, PDF:en, gruppnamn, artikelnamn (`articles.name_en`), lokalnamn och texter visas på engelska. En rad vars text är ändrad för hand visas som den är. Hela dokumentet byggs av `quote_doc()` i databasen; kundlänken går via `public_quote()`.
- **Inställningar → Offert:** inledning, avslutning och avtalsvillkor på svenska och engelska, giltighet, omslagsbild och vilka delar som visas.
- **Personal** (`/personal`): funktioner med färg och timpris, personer (intern, frilans, leverantör) med funktioner, pass kopplade till evenemang eller fristående. Internpersonal söker pass i **personalportalen** (`/portal`, rollen *personal* ser bara den) och planerare (admin, bokare, produktion) godkänner. Evenemanget visar bemanning per funktion (t.ex. Garderob 8/10) och personalkostnad. Frilans och leverantörer ser sina pass på en personlig länk (`/pass/<token>`). Inbjudningslänkar till portalen skapas av edge-funktionen `invite-staff`.
- **Tid och attest** (`/personal/tid`): personalen rapporterar tid i portalen eller via sin länk; planerare attesterar (inte egen tid), avvisar, låser månaden och laddar ner Excel-underlag. Låsningen ligger i databasen.
- **Frilans och leverantörer:** kö per pass med svarstid; frågan går vidare vid nej eller utgången tid (`advance_invites()`, pg_cron var femte minut). Leverantörspass bekräftas via länken. Mejl hamnar i `email_outbox` och visas under Inställningar → E-post tills en e-posttjänst kopplas.
- **Appnotiser** (web push) i personalportalen: VAPID-nycklar i Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
- **Provision per kund** visas som påminnelse på offerten och dras av i den interna kalkylen.
- **Offertens utseende** (Inställningar → Offert): accentfärg, logga, omslag, rubriktypsnitt, ordning på delarna, kolumner och ett eget textblock. Gäller kundlänk och PDF. Förhandsvisning på `/forhandsvisning/offert`.
- **Kunder** med kontaktpersoner.
- **Lokaler** med kapacitet per möblering.
- **Roller:** Admin, Bokare, Produktion och Läsbehörighet. Admin och bokare ändrar bokningar, övriga läser. Reglerna ligger i databasen (Row Level Security), inte bara i gränssnittet.

## Kom igång

### 1. Supabase

1. Skapa ett projekt på [supabase.com](https://supabase.com) i region **EU (Stockholm eller Frankfurt)**.
2. Kör migrationerna i `supabase/migrations/` i ordning. Antingen i SQL Editor (klistra in filerna en i taget) eller med Supabase CLI: `supabase link` och sedan `supabase db push`.
3. **Authentication → Sign In / Providers:** stäng av *Allow new users to sign up*. Konton skapas bara via inbjudan.
4. **Authentication → URL Configuration:** sätt *Site URL* till appens adress (t.ex. `https://bokning.filadelfiacc.se`).
5. **Inbjudningar och lösenordsåterställning** fungerar med Supabase standardmejl: länken går till Site URL och appen tar emot den på inloggningssidan och skickar användaren vidare för att välja lösenord. Med egen SMTP kan mallarna i stället peka på `/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/konto/losenord` (och `type=recovery` för återställning).
6. **Bjud in dig själv:** Authentication → Users → *Invite user*. Gör dig sedan till admin i SQL Editor:
   ```sql
   update profiles set role = 'admin', full_name = 'Ditt namn' where email = 'din@epost.se';
   ```
   Övriga användare får rollen `lasare` tills en admin ändrar den (`bokare`, `produktion` eller `admin`).

För fler än ett par inbjudningar i timmen behövs egen e-postserver (SMTP) under Authentication → Emails.

### 2. Lokalt

```bash
cp .env.example .env.local   # fyll i URL och publishable key
npm install
npm run dev                  # http://localhost:3000
```

### 3. Vercel

Importera GitHub-repot på [vercel.com](https://vercel.com), lägg in samma två miljövariabler och publicera. Varje ändring på `main` publiceras automatiskt.

## Utveckling

```bash
npm test          # databasschema och krocklogik testas mot en Postgres i minnet
npm run lint
npm run typecheck
```

Databasändringar görs alltid som en ny fil i `supabase/migrations/`, aldrig genom att ändra en befintlig migration som redan körts i produktion.

## Struktur

```
supabase/migrations/   databasschema och grunddata (lokaler, kapacitet)
src/app/(app)/         inloggade sidor: schema, evenemang, kunder, lokaler, krockar
src/app/logga-in/      inloggning
src/app/auth/confirm/  tar emot länkar från inbjudnings- och återställningsmejl
src/lib/               Supabase-klient, datum i svensk tid, behörigheter, typer
src/components/        formulär och gemensamma komponenter
tests/                 tester
```

## Offerter

- **Prislista** (`/prislista`): artiklar i grupper med pris, kostnad, moms och enhet. Lokalartiklar kan kopplas till en lokal och föreslås då automatiskt när en offert skapas från ett evenemang. Standardtexter för inledning, villkor och giltighet finns under *Inställningar → Offerttexter* (`/installningar/offerttexter`). Namn, adress, org.nr, kontakt och bankgiro under *Inställningar → Företagsuppgifter* (`/installningar/foretag`); kundlänken läser dem via `public_company()`. Bara admin ändrar.
- **Offert** (`/offerter`): rader per grupp, rabatt per rad eller på alla rader, tillval som inte ingår i totalen, intern kalkyl med kostnad och marginal.
- **Kundlänk** (`/offert/<token>`): en säljande sida med stor bild, kort om varje bokad lokal (bild, säljtext, kvm, kapacitet), programmet dag för dag, prisuppställning och godkänn-knapp. Bilderna ligger i `public/lokaler/` och kopplas till lokalen via `rooms.image_path`; säljtexten i `rooms.sales_text` (dellokaler ärver från huvudlokalen). Blir aktiv när offerten markeras som skickad. Kunden kan läsa, ladda ner PDF och godkänna eller avböja. Länken kräver ingen inloggning men visar bara just den offerten och aldrig kostnader.
- **PDF** skapas på servern med `@react-pdf/renderer`, med omslagsbild och lokalkort.

## Nästa steg

1. Import från ShowWizrd som testdata.
2. Bjuda in användare direkt från appen (kräver en hemlig servernyckel i Vercel).
3. Utskick av offert via e-post direkt från appen (kräver egen SMTP).
4. Kopplingar: ekonomisystem, Ticketmaster, förfrågningar från hemsidan, kalenderprenumeration.

Personal/crew och CRM (affärer, säljpipeline) ingår inte för tillfället. Kundregistret finns kvar eftersom bokningar och offerter behöver det.

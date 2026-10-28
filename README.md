# FCC Bokning

Internt bokningssystem för Filadelfia Convention Center: lokaler, kunder, evenemang, bokningar per lokal och tidslucka, och krockkontroll.

**Teknik:** Next.js 16 (App Router), Supabase (Postgres, inloggning, behörigheter), Tailwind CSS. Körs på Vercel.

## Det som finns i fas 1

- **Schema:** vecka för vecka, en rad per lokal. Klicka i en tom ruta för att boka.
- **Evenemang:** status (förfrågan, preliminär med optionsdatum, bekräftad, genomförd, avbokad), kund, kontakt, ansvarig, deltagare, teknik, hospitality och interna anteckningar.
- **Bokningar:** ett evenemang kan ha många bokningar (lokal + tid). Återkommande bokningar skapas veckovis.
- **Krockkontroll:** lokalerna ligger i ett träd. Bokas *Stora salen, hela* blockeras Parkett, Läktare och Balkong, och tvärtom. Krockar visas i schemat, på evenemanget och under *Krockar*.
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

- **Prislista** (`/prislista`): artiklar i grupper med pris, kostnad, moms och enhet. Lokalartiklar kan kopplas till en lokal och föreslås då automatiskt när en offert skapas från ett evenemang. Standardtexter för inledning, villkor och giltighet finns under *Offerttexter*. Bara admin ändrar.
- **Offert** (`/offerter`): rader per grupp, rabatt per rad eller på alla rader, tillval som inte ingår i totalen, intern kalkyl med kostnad och marginal.
- **Kundlänk** (`/offert/<token>`): blir aktiv när offerten markeras som skickad. Kunden kan läsa, ladda ner PDF och godkänna eller avböja. Länken kräver ingen inloggning men visar bara just den offerten och aldrig kostnader.
- **PDF** skapas på servern med `@react-pdf/renderer`.

## Nästa steg

1. Import från ShowWizrd som testdata.
2. Användarsida för att bjuda in kollegor och ändra roller.
3. Utskick av offert via e-post direkt från appen (kräver egen SMTP).
4. Kopplingar: ekonomisystem, Ticketmaster, förfrågningar från hemsidan, kalenderprenumeration.

Personal/crew och CRM (affärer, säljpipeline) ingår inte för tillfället. Kundregistret finns kvar eftersom bokningar och offerter behöver det.

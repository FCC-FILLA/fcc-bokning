-- Offerter på engelska och inställningar för hur offerten ser ut.

alter table quotes add column language text not null default 'sv' check (language in ('sv', 'en'));
alter table article_groups add column name_en text;
alter table articles add column name_en text;
alter table articles add column description_en text;
alter table rooms add column name_en text;
alter table rooms add column sales_text_en text;

update article_groups set name_en = case id
  when 'lokal' then 'Venue' when 'biljett' then 'Ticketing' when 'teknik' then 'Technical production'
  when 'mat' then 'Food & beverage' when 'ovrigt' then 'Staff & services' when 'tillagg' then 'Add-ons'
  when 'expo' then 'Exhibition' end;

update rooms set name_en = v.en from (values
  ('Stora salen, hela', 'Main Hall, entire'),
  ('Parkett', 'Floor'),
  ('Läktare', 'Tiered seating'),
  ('Balkong', 'Balcony'),
  ('Rörstrandssalarna, hela', 'Rörstrand rooms, all'),
  ('Kontrollrum', 'Control room'),
  ('Kök Rörstrand', 'Kitchen Rörstrand'),
  ('Kök Karlberg', 'Kitchen Karlberg')
) as v(sv, en) where rooms.name = v.sv;

update rooms set sales_text_en = 'Stockholm''s largest concert and conference hall, seating up to 2,100 guests across the floor, tiered seating and balcony.'
  where name = 'Stora salen, hela';
update rooms set sales_text_en = 'Seven flexible rooms and two lounges that can be combined or used separately.'
  where name = 'Rörstrandssalarna, hela';
update rooms set sales_text_en = 'One floor down from the entrance level you''ll find the Birka hall. Perfect as a conference room, reception area, streaming studio or after-party venue. Birka holds up to 350 guests.'
  where name = 'Birka';
update rooms set sales_text_en = 'One floor down from the entrance level you''ll find the Karlberg hall. Perfect as a conference room, breakout room or exhibition space. Karlberg holds up to 150 guests.'
  where name = 'Karlbergssalen';

update articles set description_en = 'Morning coffee, lunch and afternoon coffee.' where name = 'Konferenspaket heldag';
update articles set description_en = 'Technician for 10 h, then charged by the hour. See separate document for specification.'
  where name like 'Grundpaket Teknik - %';

update articles a set name_en = v.en from (values
  ('Stora Salen', 'Main Hall (Stora salen)'),
  ('Rörstrand 1-7', 'Rörstrand 1–7'),
  ('Nya konferensen', 'New conference room'),
  ('Kaggeholm Rum X', 'Kaggeholm Room X'),
  ('Plan 4', 'Floor 4'),
  ('Plan 5', 'Floor 5'),
  ('Drakudden; Huvudbyggnad', 'Drakudden; Main building'),
  ('Drakudden; Annexet', 'Drakudden; Annex'),
  ('Drakudden; Gästhus', 'Drakudden; Guest house'),
  ('Drakudden; Hela gården', 'Drakudden; Entire estate'),
  ('Biljettadministration (Ticketmaster)', 'Ticket administration (Ticketmaster)'),
  ('Fribiljett', 'Complimentary ticket'),
  ('Biljettavräkning', 'Ticket settlement'),
  ('Tillägg - Matiné', 'Supplement – matinée'),
  ('Biljettkontroll / Foajépersonal; 1-500 biljetter', 'Ticket control / foyer staff; 1–500 tickets'),
  ('Biljettkontroll / Foajépersonal; 501-1000 biljetter', 'Ticket control / foyer staff; 501–1,000 tickets'),
  ('Biljettkontroll / Foajépersonal; 1001-1500 biljetter', 'Ticket control / foyer staff; 1,001–1,500 tickets'),
  ('Biljettkontroll / Foajépersonal; 1501-2000 biljetter', 'Ticket control / foyer staff; 1,501–2,000 tickets'),
  ('Säkerhetsvärd / Visitation; 1-500 biljetter', 'Security host / bag check; 1–500 tickets'),
  ('Säkerhetsvärd / Visitation; 501-1000 biljetter', 'Security host / bag check; 501–1,000 tickets'),
  ('Säkerhetsvärd / Visitation; 1001-1500 biljetter', 'Security host / bag check; 1,001–1,500 tickets'),
  ('Säkerhetsvärd / Visitation; 1501-2000 biljetter', 'Security host / bag check; 1,501–2,000 tickets'),
  ('Grundpaket Teknik - Stora Salen', 'Basic technical package – Main Hall'),
  ('Grundpaket Teknik - Rörstrand', 'Basic technical package – Rörstrand'),
  ('Grundpaket Teknik - Birka', 'Basic technical package – Birka'),
  ('Grundpaket Teknik - Karlberg', 'Basic technical package – Karlberg'),
  ('Ljuspaket Small - Stora Salen', 'Lighting package Small – Main Hall'),
  ('Ljuspaket Medium - Stora Salen', 'Lighting package Medium – Main Hall'),
  ('Ljuspaket Large - Stora Salen', 'Lighting package Large – Main Hall'),
  ('Bildpaket Small - Stora Salen', 'Video package Small – Main Hall'),
  ('Bildpaket Medium - Stora Salen', 'Video package Medium – Main Hall'),
  ('Bildpaket Large - Stora Salen', 'Video package Large – Main Hall'),
  ('Ljudpaket Small - Stora Salen', 'Sound package Small – Main Hall'),
  ('Ljudpaket Medium - Stora Salen', 'Sound package Medium – Main Hall'),
  ('Ljudpaket Large - Stora Salen', 'Sound package Large – Main Hall'),
  ('Streamingpaket Small - Stora Salen', 'Streaming package Small – Main Hall'),
  ('Streamingpaket Medium - Stora Salen', 'Streaming package Medium – Main Hall'),
  ('Streamingpaket Large - Stora Salen', 'Streaming package Large – Main Hall'),
  ('Materialprepp', 'Media preparation'),
  ('Test & redigering av material', 'Media testing & editing'),
  ('Inspelning: Enkel inspelning av L/R', 'Recording: simple stereo (L/R)'),
  ('Inspelning: Multitrack 64ch', 'Recording: 64-channel multitrack'),
  ('Försäljning av produktionsmaterial', 'Sale of production materials'),
  ('Hyra av produktionsmaterial', 'Rental of production materials'),
  ('Hyra av produktionsteknik', 'Rental of production equipment'),
  ('Hyra av backline', 'Backline rental'),
  ('Teknik för länkinringning (Zoom/Teams)', 'Remote-participant setup (Zoom/Teams)'),
  ('Hyra av trådlös mikrofon', 'Wireless microphone rental'),
  ('Hyra av trådlös IEM', 'Wireless in-ear monitor rental'),
  ('Hyra av extra broadcastkamera', 'Additional broadcast camera rental'),
  ('Steadycamrigg (utan kamera, med länk)', 'Steadicam rig (without camera, with link)'),
  ('Hyra av TV-monitor 43"', 'TV monitor rental 43"'),
  ('Hyra av TV-monitor 55"', 'TV monitor rental 55"'),
  ('Hyra av TV-monitor 65"', 'TV monitor rental 65"'),
  ('Hyra av TV-monitor 75"', 'TV monitor rental 75"'),
  ('Hyra av TV-monitor 85"', 'TV monitor rental 85"'),
  ('LED-banner utomhus; 25x1 m', 'Outdoor LED banner; 25 × 1 m'),
  ('Streamingtjänst Vimeo', 'Vimeo streaming service'),
  ('Scenpodie, per m2', 'Stage riser, per m²'),
  ('Scen', 'Stage'),
  ('Kravallpaket', 'Crowd barrier package'),
  ('AV-tekniker (heldag, upp till 10 h)', 'AV technician (full day, up to 10 h)'),
  ('AV-tekniker (per timme, efter 10 h)', 'AV technician (per hour, after 10 h)'),
  ('Ljudtekniker (heldag, upp till 10 h)', 'Sound engineer (full day, up to 10 h)'),
  ('Ljudtekniker (per timme, efter 10 h)', 'Sound engineer (per hour, after 10 h)'),
  ('Ljustekniker (heldag, upp till 10 h)', 'Lighting technician (full day, up to 10 h)'),
  ('Ljustekniker (per timme, efter 10 h)', 'Lighting technician (per hour, after 10 h)'),
  ('Bildtekniker (heldag, upp till 10 h)', 'Video technician (full day, up to 10 h)'),
  ('Bildtekniker (per timme, efter 10 h)', 'Video technician (per hour, after 10 h)'),
  ('Bildproducent (heldag, upp till 10 h)', 'Video producer (full day, up to 10 h)'),
  ('Bildproducent (per timme, efter 10 h)', 'Video producer (per hour, after 10 h)'),
  ('Kameraoperatör (heldag, upp till 10 h)', 'Camera operator (full day, up to 10 h)'),
  ('Kameraoperatör (per timme, efter 10 h)', 'Camera operator (per hour, after 10 h)'),
  ('Steady-operatör (heldag, upp till 10 h)', 'Steadicam operator (full day, up to 10 h)'),
  ('Steady-operatör (per timme, efter 10 h)', 'Steadicam operator (per hour, after 10 h)'),
  ('Scenchef / Studioman (heldag, upp till 10 h)', 'Stage manager / floor manager (full day, up to 10 h)'),
  ('Scenchef / Studioman (per timme, efter 10 h)', 'Stage manager / floor manager (per hour, after 10 h)'),
  ('Länktekniker (heldag, upp till 10 h)', 'Link technician (full day, up to 10 h)'),
  ('Länktekniker (per timme, efter 10 h)', 'Link technician (per hour, after 10 h)'),
  ('Videofotograf med egen utrustning (heldag, 10 h)', 'Videographer with own equipment (full day, 10 h)'),
  ('Videofotograf med egen utrustning (per timme, efter 10 h)', 'Videographer with own equipment (per hour, after 10 h)'),
  ('Drakudden; TV, högtalare, 2 st mikrofoner', 'Drakudden; TV, speakers, 2 microphones'),
  ('Drakudden; LCD-projektor, högtalare, filmduk', 'Drakudden; LCD projector, speakers, screen'),
  ('Säkerhetsvärd', 'Security host'),
  ('Konferensvärd', 'Conference host'),
  ('Bemannad garderob', 'Staffed cloakroom'),
  ('Ordningsvakt (minimum 5,5 h)', 'Licensed security guard (minimum 5.5 h)'),
  ('Konferensvärd; 1-500 gäster', 'Conference host; 1–500 guests'),
  ('Konferensvärd; 501-1000 gäster', 'Conference host; 501–1,000 guests'),
  ('Konferensvärd; 1001-1500 gäster', 'Conference host; 1,001–1,500 guests'),
  ('Bemannad garderob; 1-500 gäster', 'Staffed cloakroom; 1–500 guests'),
  ('Bemannad garderob; 501-1000 gäster', 'Staffed cloakroom; 501–1,000 guests'),
  ('Bemannad garderob; 1001-1500 gäster', 'Staffed cloakroom; 1,001–1,500 guests'),
  ('Möblering', 'Furniture setup'),
  ('Möblering: 1-100 gäster schablon', 'Furniture setup: 1–100 guests, standard'),
  ('Möblering: 101-200 gäster schablon', 'Furniture setup: 101–200 guests, standard'),
  ('Möblering: 201-300 gäster schablon', 'Furniture setup: 201–300 guests, standard'),
  ('Möblering: 301-400 gäster schablon', 'Furniture setup: 301–400 guests, standard'),
  ('Möblering: 401-500 gäster schablon', 'Furniture setup: 401–500 guests, standard'),
  ('Möblering: 501-600 gäster schablon', 'Furniture setup: 501–600 guests, standard'),
  ('Möblering: 601-700 gäster schablon', 'Furniture setup: 601–700 guests, standard'),
  ('Möblering: 701-800 gäster schablon', 'Furniture setup: 701–800 guests, standard'),
  ('Möblering: 801-900 gäster schablon', 'Furniture setup: 801–900 guests, standard'),
  ('Möblering: 901-1000 gäster schablon', 'Furniture setup: 901–1,000 guests, standard'),
  ('Möblering: 1-100 gäster middag/mingel', 'Furniture setup: 1–100 guests, dinner/reception'),
  ('Möblering: 101-200 gäster middag/mingel', 'Furniture setup: 101–200 guests, dinner/reception'),
  ('Möblering: 201-300 gäster middag/mingel', 'Furniture setup: 201–300 guests, dinner/reception'),
  ('Möblering: 301-400 gäster middag/mingel', 'Furniture setup: 301–400 guests, dinner/reception'),
  ('Möblering: 401-500 gäster middag/mingel', 'Furniture setup: 401–500 guests, dinner/reception'),
  ('Möblering: 501-600 gäster middag/mingel', 'Furniture setup: 501–600 guests, dinner/reception'),
  ('Möblering: 601-700 gäster middag/mingel', 'Furniture setup: 601–700 guests, dinner/reception'),
  ('Möblering: 701-800 gäster middag/mingel', 'Furniture setup: 701–800 guests, dinner/reception'),
  ('Möblering: 801-900 gäster middag/mingel', 'Furniture setup: 801–900 guests, dinner/reception'),
  ('Möblering: 901-1000 gäster middag/mingel', 'Furniture setup: 901–1,000 guests, dinner/reception'),
  ('Plattform vid bordsmöblering över läktare', 'Platform for table seating over the stalls'),
  ('Städavgift: Stora salen konfetti', 'Cleaning fee: confetti, Main Hall'),
  ('Städavgift: Rörstrand konfetti', 'Cleaning fee: confetti, Rörstrand'),
  ('Städavgift: Birka konfetti', 'Cleaning fee: confetti, Birka'),
  ('Tält: Garderob', 'Tent: cloakroom'),
  ('Hyra: Studiodekor', 'Rental: studio set'),
  ('Block och penna', 'Notepad and pen'),
  ('Förskottsbetalning (anges exkl. moms)', 'Advance payment (excl. VAT)'),
  ('Orderrabatt', 'Order discount'),
  ('Projektledare', 'Project manager'),
  ('Teknisk projektledare', 'Technical project manager'),
  ('Brandvakt', 'Fire watch'),
  ('Förproduktion & lokalrep åt arrangör', 'Pre-production & venue rehearsal for organiser'),
  ('Konferenspaket heldag', 'Full-day conference package'),
  ('Konferenspaket halvdag', 'Half-day conference package'),
  ('Förmiddagsfika med smörgås', 'Morning coffee with sandwich'),
  ('Eftermiddagsfika med bakverk', 'Afternoon coffee with pastry'),
  ('Lunch Chef''s choice', 'Lunch (chef''s choice)'),
  ('Middag', 'Dinner'),
  ('Trerätters middag inkl. dryckespaket (Chef''s choice)', 'Three-course dinner incl. drinks package (chef''s choice)'),
  ('Tvårätters middag inkl. dryckespaket (Chef''s choice)', 'Two-course dinner incl. drinks package (chef''s choice)'),
  ('Trerätters middag (Chef''s choice)', 'Three-course dinner (chef''s choice)'),
  ('Tvårätters middag (Chef''s choice)', 'Two-course dinner (chef''s choice)'),
  ('Dryckespaket (endast i samband med middag)', 'Drinks package (with dinner only)'),
  ('Mingel: Tre små tilltugg (Chef''s choice)', 'Reception: three canapés (chef''s choice)'),
  ('Mingel: Tre streetfood (Chef''s choice)', 'Reception: three street-food bites (chef''s choice)'),
  ('Mingel: Snacks', 'Reception: snacks'),
  ('Kaffe/te', 'Coffee/tea'),
  ('Kaffe/te (kanna 3 l)', 'Coffee/tea (3 l pot)'),
  ('Wrap inkl. dryck (Chef''s choice)', 'Wrap incl. drink (chef''s choice)'),
  ('Konsert: Logevärdinna', 'Concert: dressing-room host'),
  ('Konsert: Logearrangemang', 'Concert: dressing-room catering'),
  ('Konsert: Hyra kök', 'Concert: kitchen rental'),
  ('Konsert: Handduk liten (hyra inkl. tvätt)', 'Concert: small towel (rental incl. laundry)'),
  ('Konsert: Handduk stor (hyra inkl. tvätt)', 'Concert: large towel (rental incl. laundry)'),
  ('Crew: Frukost', 'Crew: breakfast'),
  ('Crew: Lunch', 'Crew: lunch'),
  ('Crew: Fika', 'Crew: coffee break'),
  ('Crew: Middag', 'Crew: dinner'),
  ('Crew: Riggvagn', 'Crew: rigging-day food trolley'),
  ('Bar: Dryckesbiljett (1 st per person)', 'Bar: drink voucher (1 per person)'),
  ('Bar: Dryckesbiljett (2 st per person)', 'Bar: drink vouchers (2 per person)'),
  ('Bar: Minimumspend bar 50-100 p', 'Bar: minimum spend, 50–100 guests'),
  ('Bar: Minimumspend bar 101-200 p', 'Bar: minimum spend, 101–200 guests'),
  ('Bar: Minimumspend bar 201-300 p', 'Bar: minimum spend, 201–300 guests'),
  ('Bar: Minimumspend bar 301-400 p', 'Bar: minimum spend, 301–400 guests'),
  ('Bar: Minimumspend bar 401-500 p', 'Bar: minimum spend, 401–500 guests'),
  ('Bar: Minimumspend bar 500 p +', 'Bar: minimum spend, 500+ guests'),
  ('Bar: Vatten/läsk', 'Bar: water/soft drink'),
  ('Bar: Cider (enhet)', 'Bar: cider (unit)'),
  ('Bar: Öl (enhet)', 'Bar: beer (unit)'),
  ('Bar: Vin (glas)', 'Bar: wine (glass)'),
  ('Bar: Mousserande (glas)', 'Bar: sparkling wine (glass)'),
  ('Bar: Vin (flaska)', 'Bar: wine (bottle)'),
  ('Bar: Mousserande (flaska)', 'Bar: sparkling wine (bottle)'),
  ('Specialpaket enligt bilaga', 'Special package as per appendix'),
  ('Provsmakning exkl. menypris', 'Menu tasting excl. menu price'),
  ('Specialkost', 'Special dietary requirements'),
  ('Tillägg administrativa kostnader', 'Administrative fee'),
  ('Serveringsavgift (vid cateringorder under 10 000 kr)', 'Service fee (catering orders under SEK 10,000)'),
  ('Vickning', 'Late-night snack'),
  ('Drakudden; Bastu', 'Drakudden; Sauna'),
  ('Drakudden; Kanot inkl. paddlar och flytväst', 'Drakudden; Canoe incl. paddles and life jacket'),
  ('Drakudden; Roddbåt inkl. paddlar och flytväst', 'Drakudden; Rowing boat incl. oars and life jacket'),
  ('Drakudden; Handdukar + sänglinne', 'Drakudden; Towels + bed linen'),
  ('Drakudden; Sänglinne', 'Drakudden; Bed linen'),
  ('Drakudden; Extra timmar', 'Drakudden; Extra hours'),
  ('Expo: Ström & 1 ståbord (per monter)', 'Expo: Power & 1 high table (per booth)'),
  ('Expo: Sop-/godshantering (per monter)', 'Expo: Waste & goods handling (per booth)'),
  ('Expo: Internet på kabel', 'Expo: Wired internet'),
  ('Expo: Internet på wifi, dedikerad', 'Expo: Dedicated Wi-Fi')
) as v(sv, en) where a.name = v.sv;

-- Standardtexter på engelska och utseende.
insert into app_settings (key, value) values
  ('quote_intro_en', 'Thank you for your enquiry! Here is our proposal for your event at Filadelfia Convention Center. Please get in touch if you have any questions or would like to adjust anything.'),
  ('quote_terms_en', E'The booking becomes binding once the quote has been accepted and the booking agreement has been signed by both parties.\n\nPayment: invoice, 30 days net. All prices are stated excluding VAT. New customers pay 100% in advance. Bookings over SEK 250,000 excl. VAT may require advance payment.\n\nCancellation (share of the base cost excl. catering): more than 26 weeks before: 0%. 12–26 weeks before: 20%. 4–12 weeks before: 50%. Less than 4 weeks before: 100%.\n\nFood and beverages are provided by FCC''s exclusive catering partner. The final number of guests must be confirmed in writing no later than 14 days before the event. Ticket sales are handled via Ticketmaster and merchandise via Scandinavian Concessions Management.\n\nFCC''s general terms and conditions and booking agreement apply in all other respects.'),
  ('look_closing', 'Varmt välkomna till Filadelfia Convention Center! Vi ser fram emot att göra ert arrangemang till något alldeles extra.'),
  ('look_closing_en', 'A warm welcome to Filadelfia Convention Center! We look forward to making your event something truly special.'),
  ('look_cover', ''),
  ('look_show_rooms', '1'),
  ('look_show_program', '1'),
  ('look_show_addons', '1'),
  ('look_show_images', '1')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Hela offerten som kunden ser den, på offertens språk. Körs med anroparens rättigheter
-- (inloggad personal), och via public_quote() för kundlänken.
-- ---------------------------------------------------------------------------
create or replace function quote_doc(p_quote uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'number', q.number,
    'title', q.title,
    'status', q.status,
    'language', q.language,
    'valid_until', q.valid_until,
    'intro', q.intro,
    'terms', q.terms,
    'sent_at', q.sent_at,
    'accepted_at', q.accepted_at,
    'accepted_name', q.accepted_name,
    'declined_at', q.declined_at,
    'company_name', c.name,
    'contact_name', ct.name,
    'salesperson_name', p.full_name,
    'salesperson_email', p.email,
    'event_title', e.title,
    'participants', e.participants,
    'settings', (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings
      where key like 'company\_%' or key like 'look\_%'
    ),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'room', case when q.language = 'en' then coalesce(r.name_en, r.name) else r.name end,
        'starts_at', b.starts_at, 'ends_at', b.ends_at) order by b.starts_at)
      from bookings b join rooms r on r.id = b.room_id
      where b.event_id = q.event_id
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(x order by x ->> 'sort')
      from (
        select distinct on (r.id) jsonb_build_object(
          'name', case when q.language = 'en' then coalesce(r.name_en, r.name) else r.name end,
          'image', coalesce(r.image_path, pr.image_path),
          'gallery', to_jsonb(case when r.image_path is null and pr.id is not null then room_images(pr.id) else room_images(r.id) end),
          'text', case when q.language = 'en' then r.sales_text_en else r.sales_text end,
          'kvm', r.kvm,
          'max', (select max(capacity) from room_capacities rc where rc.room_id = r.id),
          'sort', lpad(r.sort_order::text, 5, '0')
        ) as x
        from bookings b join rooms r on r.id = b.room_id left join rooms pr on pr.id = r.parent_id
        where b.event_id = q.event_id
      ) s
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', case when q.language = 'en' then coalesce(g.name_en, g.name) else g.name end,
        'group_order', g.sort_order,
        -- Oförändrat artikelnamn översätts; egen text på raden lämnas som den är.
        'description', case when q.language = 'en' and a.id is not null and l.description = a.name then coalesce(a.name_en, a.name) else l.description end,
        'line_date', l.line_date,
        'quantity', l.quantity, 'unit', l.unit, 'unit_price', l.unit_price,
        'discount_pct', l.discount_pct, 'vat_rate', l.vat_rate, 'kind', l.kind,
        'image', coalesce(a.image_path, r.image_path, pr.image_path),
        'icon', coalesce(a.icon, g.icon, 'box'),
        'text', case when q.language = 'en' then coalesce(a.description_en, r.sales_text_en) else coalesce(a.description, r.sales_text) end,
        'gallery', case when r.id is null then '[]'::jsonb else to_jsonb(room_images(r.id)) end
      ) order by g.sort_order, l.sort_order)
      from quote_lines l
      join article_groups g on g.id = l.group_id
      left join articles a on a.id = l.article_id
      left join rooms r on r.id = a.room_id
      left join rooms pr on pr.id = r.parent_id
      where l.quote_id = q.id
    ), '[]'::jsonb)
  )
  from quotes q
  left join companies c on c.id = q.company_id
  left join contacts ct on ct.id = q.contact_id
  left join profiles p on p.id = q.salesperson_id
  left join events e on e.id = q.event_id
  where q.id = p_quote
$$;
revoke execute on function quote_doc(uuid) from public, anon;
grant execute on function quote_doc(uuid) to authenticated;

-- Kundlänken: samma dokument, men bara för skickade/besvarade offerter och via hemlig länk.
create or replace function public_quote(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select quote_doc(q.id) from quotes q
  where q.share_token = p_token and q.status in ('skickad', 'accepterad', 'avbojd')
$$;
revoke execute on function public_quote(uuid) from public;
grant execute on function public_quote(uuid) to anon, authenticated;

drop function if exists line_media(uuid, text);

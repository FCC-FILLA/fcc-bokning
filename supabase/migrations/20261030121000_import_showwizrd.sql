-- Import av ett evenemang med offerter från ShowWizrd (JSON som förberetts av importskriptet).
-- Villkor: offertens egna om de avviker från standard, annars standardtexten för språket.
-- Kan köras igen: evenemanget och dess offerter ersätts via external_id.
-- Offertrader kopplas alltid till en artikel i prislistan. Saknas artikeln skapas den;
-- saknar artikeln pris får den priset (och kostnaden) från ShowWizrd.
create or replace function import_sw_event(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_event uuid; v_company uuid; v_contact uuid; v_quote uuid; v_room uuid;
  b jsonb; q jsonb; l jsonb; a record;
  n_book int := 0; n_quotes int := 0; n_lines int := 0; n_new_art int := 0; n_priced int := 0;
  missing text[] := '{}'; i int;
begin
  select id into v_company from companies where lower(name) = lower(p->>'company') order by created_at limit 1;
  if v_company is not null then
    select id into v_contact from contacts where company_id = v_company and lower(name) = lower(p->>'contact') limit 1;
  end if;

  delete from quotes where external_id in (select x->>'ext_id' from jsonb_array_elements(p->'quotes') x);
  delete from events where external_id = p->>'ext_id';

  insert into events (title, status, event_type_id, company_id, contact_id, participants, option_rank,
                      description, technical_info, hospitality_info, internal_notes, external_id)
  values (p->>'title', (p->>'status')::event_status, p->>'type', v_company, v_contact,
          nullif(p->>'participants', '')::int, nullif(p->>'rank', '')::int,
          p->>'description', p->>'technical', p->>'hospitality', p->>'internal', p->>'ext_id')
  returning id into v_event;

  for b in select * from jsonb_array_elements(p->'bookings') loop
    select id into v_room from rooms where lower(name) = lower(b->>'room') limit 1;
    if v_room is null then missing := array_append(missing, b->>'room'); continue; end if;
    insert into bookings (event_id, room_id, starts_at, ends_at)
    values (v_event, v_room, (b->>'starts')::timestamptz, (b->>'ends')::timestamptz);
    n_book := n_book + 1;
  end loop;

  for q in select * from jsonb_array_elements(p->'quotes') loop
    insert into quotes (title, status, event_id, company_id, contact_id, terms, language, external_id, created_at, sent_at)
    values (q->>'title', (q->>'status')::quote_status, v_event, v_company, v_contact,
            coalesce(q->>'terms', (select value from app_settings where key = case when q->>'language' = 'en' then 'quote_terms_en' else 'quote_terms' end)),
            coalesce(q->>'language', 'sv'), q->>'ext_id',
            coalesce((q->>'created')::timestamptz, now()),
            case when q->>'status' in ('skickad', 'accepterad', 'avbojd') then coalesce((q->>'created')::timestamptz, now()) end)
    returning id into v_quote;
    n_quotes := n_quotes + 1;

    for b in select * from jsonb_array_elements(q->'rooms') loop
      select id into v_room from rooms where lower(name) = lower(b->>'room') limit 1;
      if v_room is null then missing := array_append(missing, b->>'room'); continue; end if;
      insert into quote_rooms (quote_id, room_id, starts_at, ends_at)
      values (v_quote, v_room, (b->>'starts')::timestamptz, (b->>'ends')::timestamptz);
    end loop;

    i := 0;
    for l in select * from jsonb_array_elements(q->'lines') loop
      i := i + 1;
      -- 1) exakt namn, 2) längsta artikelnamn som raden börjar med
      select ar.id, ar.group_id, ar.price, ar.cost into a from articles ar
      where ar.active and lower(ar.name) = lower(l->>'hint') limit 1;
      if a.id is null then
        select ar.id, ar.group_id, ar.price, ar.cost into a from articles ar
        where ar.active and length(ar.name) >= 4 and lower(l->>'desc') like lower(ar.name) || '%'
        order by length(ar.name) desc limit 1;
      end if;
      if a.id is null then
        insert into articles (name, group_id, unit, price, cost, vat_rate, active)
        values (l->>'hint', l->>'group', 'st', (l->>'price')::numeric, coalesce((l->>'cost')::numeric, 0), 25, true)
        returning id, group_id, price, cost into a;
        n_new_art := n_new_art + 1;
      elsif a.price is null and (l->>'price')::numeric > 0 then
        update articles set price = (l->>'price')::numeric,
          cost = case when coalesce(cost, 0) = 0 then coalesce((l->>'cost')::numeric, 0) else cost end, updated_at = now()
        where id = a.id;
        n_priced := n_priced + 1;
      end if;
      insert into quote_lines (quote_id, group_id, article_id, description, line_date, quantity, unit_price, cost, discount_pct, vat_rate, kind, sort_order)
      values (v_quote, a.group_id, a.id, l->>'desc', nullif(l->>'date', '')::date, (l->>'qty')::numeric, (l->>'unit_price')::numeric,
              coalesce((l->>'cost')::numeric, 0), (l->>'disc')::numeric, 25, (l->>'kind')::quote_line_kind, i);
      n_lines := n_lines + 1;
      a := null;
    end loop;
  end loop;

  return jsonb_build_object('event', p->>'title', 'company_found', v_company is not null, 'contact_found', v_contact is not null,
    'bookings', n_book, 'quotes', n_quotes, 'lines', n_lines, 'new_articles', n_new_art, 'priced_articles', n_priced, 'missing_rooms', missing);
end $$;
revoke execute on function import_sw_event(jsonb) from public, anon, authenticated;

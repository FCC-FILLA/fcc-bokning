// Kör databasmigrationerna mot en Postgres i minnet (PGlite) och testar
// krockkontrollen och behörigheterna. Kör med: npm test
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

// Minimal ersättning för det Supabase tillhandahåller: auth-schemat och rollerna.
const SUPABASE_STUBS = `
  create role authenticated;
  create role anon;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

let db: PGlite;

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const LASARE = "00000000-0000-0000-0000-00000000000b";

async function roomId(name: string) {
  const r = await db.query<{ id: string }>("select id from rooms where name = $1", [name]);
  return r.rows[0].id;
}

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function book(title: string, status: string, room: string, from: string, to: string) {
  const e = await db.query<{ id: string }>(
    "insert into events (title, status) values ($1, $2::event_status) returning id",
    [title, status],
  );
  await db.query("insert into bookings (event_id, room_id, starts_at, ends_at) values ($1, $2, $3, $4)", [
    e.rows[0].id,
    await roomId(room),
    from,
    to,
  ]);
  return e.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@fcc.se'), ('${LASARE}', 'lasare@fcc.se');
    update profiles set role = 'admin' where id = '${ADMIN}';
  `);
});

describe("lokaler", () => {
  it("har alla lokaler från kapacitetstabellen", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from rooms");
    expect(r.rows[0].n).toBe(16);
  });

  it("vet att delar av en sal krockar med hela salen", async () => {
    const q = (a: string, b: string) =>
      db.query<{ x: boolean }>("select rooms_overlap((select id from rooms where name=$1),(select id from rooms where name=$2)) as x", [a, b]);
    expect((await q("Rörstrand 1", "Rörstrandssalarna, hela")).rows[0].x).toBe(true);
    expect((await q("Rörstrandssalarna, hela", "Rörstrand 2")).rows[0].x).toBe(true);
    expect((await q("Rörstrand 1", "Rörstrand 2")).rows[0].x).toBe(false);
    expect((await q("Lounge 1", "Rörstrandssalarna, hela")).rows[0].x).toBe(false);
    expect((await q("Birka", "Rörstrand 1")).rows[0].x).toBe(false);
  });
});

describe("krockkontroll", () => {
  it("hittar krock mellan hel sal och delyta, men inte mellan avbokade", async () => {
    await book("Konsert", "bekraftad", "Rörstrandssalarna, hela", "2027-03-01T12:00+01", "2027-03-01T23:00+01");
    await book("Mässa", "preliminar", "Rörstrand 3", "2027-03-01T09:00+01", "2027-03-01T13:00+01");
    await book("Gammal", "avbokad", "Rörstrand 4", "2027-03-01T15:00+01", "2027-03-01T16:00+01");
    await book("Kväll", "bekraftad", "Rörstrand 3", "2027-03-02T09:00+01", "2027-03-02T13:00+01");

    const c = await db.query<{ event_title: string; other_event_title: string }>(
      "select event_title, other_event_title from booking_conflicts order by event_title",
    );
    expect(c.rows).toEqual([
      { event_title: "Konsert", other_event_title: "Mässa" },
      { event_title: "Mässa", other_event_title: "Konsert" },
    ]);

    const pre = await db.query<{ event_title: string }>(
      "select event_title from check_conflicts((select id from rooms where name='Rörstrand 4'), '2027-03-01T22:00+01', '2027-03-01T23:30+01')",
    );
    expect(pre.rows.map((r) => r.event_title)).toEqual(["Konsert"]);
  });

  it("räknar fram evenemangets tidsspann från bokningarna", async () => {
    const r = await db.query<{ booking_count: number }>("select booking_count from event_overview where title = 'Konsert'");
    expect(r.rows[0].booking_count).toBe(1);
  });
});

describe("behörigheter", () => {
  it("läsare kan läsa men inte skapa evenemang", async () => {
    await asUser(LASARE, async () => {
      const r = await db.query<{ n: number }>("select count(*)::int as n from events");
      expect(r.rows[0].n).toBeGreaterThan(0);
      await expect(db.query("insert into events (title) values ('Försök')")).rejects.toThrow(/row-level security/);
    });
  });

  it("admin kan skapa evenemang", async () => {
    await asUser(ADMIN, async () => {
      const r = await db.query<{ id: string }>("insert into events (title) values ('Admin-test') returning id");
      expect(r.rows).toHaveLength(1);
    });
  });

  it("utomstående utan profil ser ingenting", async () => {
    await asUser("00000000-0000-0000-0000-0000000000ff", async () => {
      const r = await db.query<{ n: number }>("select count(*)::int as n from events");
      expect(r.rows[0].n).toBe(0);
    });
  });
});

describe("offerter", () => {
  async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec(`grant usage on schema public to anon; set role anon;`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role;`);
    }
  }

  it("har prislistan med artiklar kopplade till lokaler", async () => {
    const r = await db.query<{ n: number; linked: number }>(
      "select count(*)::int as n, count(room_id)::int as linked from articles",
    );
    expect(r.rows[0].n).toBe(200);
    expect(r.rows[0].linked).toBe(13);
  });

  it("räknar samma summor i databasen som i appen", async () => {
    const q = await db.query<{ id: string }>("insert into quotes (title) values ('Test') returning id");
    const id = q.rows[0].id;
    await db.query(
      `insert into quote_lines (quote_id, group_id, description, quantity, unit_price, discount_pct, kind) values
       ($1, 'lokal', 'Stora salen', 1, 90000, 20, 'ingar'),
       ($1, 'teknik', 'Scen', 1, 58000, 0, 'ingar'),
       ($1, 'mat', 'Hyra kök', 1, 3000, 0, 'tillval')`,
      [id],
    );
    const r = await db.query<{ total_ex_vat: string; total_vat: string; addons_ex_vat: string }>(
      "select total_ex_vat, total_vat, addons_ex_vat from quote_overview where id = $1",
      [id],
    );
    expect(Number(r.rows[0].total_ex_vat)).toBe(130000);
    expect(Number(r.rows[0].total_vat)).toBe(32500);
    expect(Number(r.rows[0].addons_ex_vat)).toBe(3000);
  });

  it("visar bara skickade offerter för kunden och låter kunden godkänna en gång", async () => {
    const q = await db.query<{ id: string; share_token: string }>(
      "insert into quotes (title, valid_until) values ('Kundtest', current_date + 10) returning id, share_token",
    );
    const { id, share_token } = q.rows[0];

    const hidden = await asAnon(() => db.query<{ q: unknown }>("select public_quote($1) as q", [share_token]));
    expect(hidden.rows[0].q).toBeNull();

    await db.query("update quotes set status = 'skickad' where id = $1", [id]);
    const shown = await asAnon(() => db.query<{ q: { title: string } }>("select public_quote($1) as q", [share_token]));
    expect(shown.rows[0].q.title).toBe("Kundtest");

    const bad = await asAnon(() =>
      db.query<{ r: string }>("select respond_to_quote($1, true, 'Anna', 'inte-en-adress') as r", [share_token]),
    );
    expect(bad.rows[0].r).toBe("ogiltig");

    const ok = await asAnon(() =>
      db.query<{ r: string }>("select respond_to_quote($1, true, 'Anna Andersson', 'anna@exempel.se') as r", [share_token]),
    );
    expect(ok.rows[0].r).toBe("accepterad");

    const again = await asAnon(() =>
      db.query<{ r: string }>("select respond_to_quote($1, false, 'Anna', 'anna@exempel.se') as r", [share_token]),
    );
    expect(again.rows[0].r).toBe("ej_tillganglig");

    const s = await db.query<{ status: string; accepted_name: string }>("select status, accepted_name from quotes where id = $1", [id]);
    expect(s.rows[0]).toEqual({ status: "accepterad", accepted_name: "Anna Andersson" });
  });

  it("utloggade kan inte läsa offerttabellerna direkt", async () => {
    await expect(asAnon(() => db.query("select * from quotes"))).rejects.toThrow(/permission denied/);
    await expect(asAnon(() => db.query("select * from articles"))).rejects.toThrow(/permission denied/);
  });

  it("läsare kan se prislistan men inte ändra den", async () => {
    await asUser(LASARE, async () => {
      const r = await db.query<{ n: number }>("select count(*)::int as n from articles");
      expect(r.rows[0].n).toBe(200);
      const u = await db.query("update articles set price = 1 where article_no = '1'");
      expect(u.affectedRows).toBe(0);
    });
  });
});

describe("historik och kalender", () => {
  it("loggar ändrade fält med vem som ändrade", async () => {
    let id = "";
    await asUser(ADMIN, async () => {
      const e = await db.query<{ id: string }>("insert into events (title) values ('Loggtest') returning id");
      id = e.rows[0].id;
      await db.query("update events set status = 'preliminar', updated_at = now() where id = $1", [id]);
      await db.query("update events set updated_at = now() where id = $1", [id]); // ingen riktig ändring
    });
    const r = await db.query<{ action: string; user_id: string; changes: Record<string, unknown> | null }>(
      "select action, user_id, changes from audit_log where event_id = $1 order by id",
      [id],
    );
    expect(r.rows.map((x) => x.action)).toEqual(["skapad", "andrad"]);
    expect(r.rows[1].user_id).toBe(ADMIN);
    expect(Object.keys(r.rows[1].changes!)).toEqual(["status"]);
  });

  it("kalenderlänken visar bokningar för aktiva användare och inget för fel länk", async () => {
    await book("Kalendertest", "bekraftad", "Birka", new Date(Date.now() + 864e5).toISOString(), new Date(Date.now() + 2 * 864e5).toISOString());
    const t = await db.query<{ token: string }>(
      `insert into calendar_tokens (user_id) values ('${LASARE}') returning token`,
    );
    const token = t.rows[0].token;
    await db.exec("grant usage on schema public to anon; set role anon;");
    try {
      const ok = await db.query<{ title: string }>("select title from calendar_feed($1)", [token]);
      expect(ok.rows.map((x) => x.title)).toContain("Kalendertest");
      const bad = await db.query("select * from calendar_feed('00000000-0000-0000-0000-000000000000')");
      expect(bad.rows).toHaveLength(0);
    } finally {
      await db.exec("reset role;");
    }
    await db.query(`update profiles set active = false where id = '${LASARE}'`);
    const off = await db.query("select * from calendar_feed($1)", [token]);
    expect(off.rows).toHaveLength(0);
    await db.query(`update profiles set active = true where id = '${LASARE}'`);
  });
});

describe("kundens offert med lokalbilder", () => {
  it("skickar med bokade lokaler, bild och kapacitet en gång per lokal", async () => {
    const ev = await book("Bildtest", "preliminar", "Rörstrand 1", "2027-05-01T08:00+02", "2027-05-01T17:00+02");
    await db.query(
      "insert into bookings (event_id, room_id, starts_at, ends_at) values ($1, (select id from rooms where name='Rörstrand 1'), '2027-05-02T08:00+02', '2027-05-02T17:00+02')",
      [ev],
    );
    const q = await db.query<{ share_token: string }>(
      "insert into quotes (title, status, event_id) values ('Bild', 'skickad', $1) returning share_token",
      [ev],
    );
    const r = await db.query<{ q: { rooms: { name: string; image: string; max: number }[]; bookings: unknown[] } }>(
      "select public_quote($1) as q",
      [q.rows[0].share_token],
    );
    expect(r.rows[0].q.bookings).toHaveLength(2);
    expect(r.rows[0].q.rooms).toHaveLength(1);
    expect(r.rows[0].q.rooms[0]).toMatchObject({ name: "Rörstrand 1", image: "/lokaler/rorstrand-1.jpg", max: 150 });
  });
});

describe("artikelbilder och ikoner", () => {
  it("ger varje offertrad bild, galleri, ikon och text", async () => {
    const q = await db.query<{ id: string; share_token: string }>("insert into quotes (title, status) values ('Kort', 'skickad') returning id, share_token");
    const id = q.rows[0].id;
    const art = (name: string) => `(select id from articles where name = '${name}')`;
    await db.exec(`
      insert into quote_lines (quote_id, group_id, article_id, description, sort_order) values
        ('${id}', 'lokal', ${art("Rörstrand 1-7")}, 'Rörstrandssalarna', 1),
        ('${id}', 'mat', ${art("Konferenspaket heldag")}, 'Konferenspaket heldag', 2),
        ('${id}', 'ovrigt', ${art("Möblering: 101-200 gäster schablon")}, 'Möblering', 3),
        ('${id}', 'teknik', null, 'Fritext utan artikel', 4);
    `);
    const r = await db.query<{ q: { lines: { image: string | null; gallery: string[]; icon: string; text: string | null }[] } }>(
      "select public_quote($1) as q",
      [q.rows[0].share_token],
    );
    const [lokal, fri, mat, mobel] = r.rows[0].q.lines;
    expect(lokal.image).toBe("/lokaler/rorstrandssalarna.jpg");
    expect(lokal.gallery.length).toBeGreaterThanOrEqual(8);
    expect(lokal.text).toMatch(/Sju flexibla salar/);
    expect(mat).toMatchObject({ icon: "meal", image: null, text: "Förmiddagsfika, lunch och eftermiddagsfika." });
    expect(mobel.icon).toBe("chair");
    expect(fri).toMatchObject({ icon: "tech", image: null, text: null, gallery: [] });
  });

  it("alla aktiva artiklar har en ikon via sig själva eller sin grupp", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from articles a join article_groups g on g.id = a.group_id where coalesce(a.icon, g.icon) is null",
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe("företagsuppgifter", () => {
  it("kan läsas utloggad via public_company men inte resten av inställningarna", async () => {
    await db.exec("set role anon");
    try {
      const r = await db.query<{ c: Record<string, string> }>("select public_company() as c");
      expect(r.rows[0].c).toMatchObject({ name: "Filadelfia Convention Center", legal_name: "Filadelfia Convention Center AB" });
      expect(Object.keys(r.rows[0].c).some((k) => k.startsWith("quote_"))).toBe(false);
      await expect(db.query("select * from app_settings")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});


describe("offert på engelska", () => {
  it("översätter grupper, artikelnamn och texter men lämnar egna radtexter", async () => {
    const q = await db.query<{ id: string; share_token: string }>(
      "insert into quotes (title, status, language) values ('English', 'skickad', 'en') returning id, share_token",
    );
    const id = q.rows[0].id;
    await db.exec(`
      insert into quote_lines (quote_id, group_id, article_id, description, sort_order) values
        ('${id}', 'mat', (select id from articles where name = 'Konferenspaket heldag'), 'Konferenspaket heldag', 1),
        ('${id}', 'mat', (select id from articles where name = 'Lunch Chef''s choice'), 'Lunch med egen meny', 2),
        ('${id}', 'lokal', (select id from articles where name = 'Birka'), 'Birka', 3);
    `);
    const r = await db.query<{ q: { language: string; lines: { group: string; description: string; text: string | null }[]; settings: Record<string, string> } }>(
      "select public_quote($1) as q",
      [q.rows[0].share_token],
    );
    const { language, lines, settings } = r.rows[0].q;
    expect(language).toBe("en");
    const [birka, paket, lunch] = lines;
    expect(birka).toMatchObject({ group: "Venue", description: "Birka" });
    expect(birka.text).toMatch(/^One floor down/);
    expect(paket).toMatchObject({ group: "Food & beverage", description: "Full-day conference package", text: "Morning coffee, lunch and afternoon coffee." });
    expect(lunch.description).toBe("Lunch med egen meny");
    expect(settings.look_closing_en).toMatch(/warm welcome/);
    expect(settings.company_name).toBe("Filadelfia Convention Center");
    expect(Object.keys(settings).some((k) => k.startsWith("quote_"))).toBe(false);
  });

  it("alla artiklar med svenska tecken eller ord har fått ett engelskt namn", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int n from articles where name_en is null and name ~ '[åäöÅÄÖ]' and name !~ '^Rörstrand [0-9]$'");
    expect(r.rows[0].n).toBe(0);
  });

  it("quote_doc kan inte anropas utloggad", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select quote_doc(gen_random_uuid())")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("personal", () => {
  const ANNA = "00000000-0000-0000-0000-0000000000c1";

  it("ny inloggning med internpersonalens e-post blir rollen personal och kopplas ihop", async () => {
    await db.exec(`
      insert into staff (name, email, kind) values ('Anna Garderob', 'anna@exempel.se', 'intern');
      insert into staff_skills select s.id, f.id from staff s, staff_functions f where s.email = 'anna@exempel.se' and f.name = 'Garderob';
      insert into auth.users (id, email) values ('${ANNA}', 'Anna@Exempel.se');
    `);
    const r = await db.query<{ role: string; linked: boolean }>(
      `select p.role, exists (select 1 from staff where profile_id = p.id) as linked from profiles p where p.id = '${ANNA}'`,
    );
    expect(r.rows[0]).toEqual({ role: "personal", linked: true });
  });

  it("personal ser inte evenemang, kunder eller offerter", async () => {
    await asUser(ANNA, async () => {
      for (const t of ["events", "bookings", "companies", "quotes", "shifts", "shift_assignments"]) {
        const r = await db.query<{ n: number }>(`select count(*)::int as n from ${t}`);
        expect(r.rows[0].n, t).toBe(0);
      }
      const own = await db.query<{ name: string }>("select name from staff");
      expect(own.rows.map((x) => x.name)).toEqual(["Anna Garderob"]);
    });
  });

  it("ser lediga pass i sina funktioner, kan söka och dra tillbaka, men inte söka fel funktion", async () => {
    const ev = await book("Gala", "bekraftad", "Stora salen", "2027-06-01T16:00+02", "2027-06-01T23:00+02");
    const mk = async (fn: string, status = "oppen") =>
      (
        await db.query<{ id: string }>(
          `insert into shifts (event_id, function_id, starts_at, ends_at, needed, status)
           values ($1, (select id from staff_functions where name = $2), '2027-06-01T15:00+02', '2027-06-01T23:30+02', 4, $3::shift_status) returning id`,
          [ev, fn, status],
        )
      ).rows[0].id;
    const garderob = await mk("Garderob");
    const kiosk = await mk("Kiosk");
    await mk("Garderob", "utkast");

    await asUser(ANNA, async () => {
      const list = await db.query<{ s: { id: string; function: string; event: string; my_status: string | null }[] }>("select portal_shifts() as s");
      expect(list.rows[0].s.map((x) => x.id)).toEqual([garderob]);
      expect(list.rows[0].s[0]).toMatchObject({ function: "Garderob", event: "Gala", my_status: null });

      expect((await db.query<{ r: string }>("select portal_apply($1) as r", [garderob])).rows[0].r).toBe("ok");
      expect((await db.query<{ r: string }>("select portal_apply($1) as r", [kiosk])).rows[0].r).toBe("fel_funktion");
      const after = await db.query<{ s: { my_status: string }[] }>("select portal_shifts() as s");
      expect(after.rows[0].s[0].my_status).toBe("ansokt");
      expect((await db.query<{ r: string }>("select portal_withdraw($1) as r", [garderob])).rows[0].r).toBe("ok");
      // Personal kan inte tilldela sig själv direkt.
      await expect(db.query("update shift_assignments set status = 'tilldelad'")).resolves.toMatchObject({ affectedRows: 0 });
    });
  });

  it("läsare kan inte skapa pass, admin kan", async () => {
    const ins = "insert into shifts (function_id, starts_at, ends_at) values ((select id from staff_functions limit 1), now(), now() + interval '1 hour')";
    await asUser(LASARE, async () => {
      await expect(db.query(ins)).rejects.toThrow();
    });
    await asUser(ADMIN, async () => {
      await expect(db.query(ins)).resolves.toBeTruthy();
    });
  });
});

describe("personlig länk", () => {
  it("visar leverantörens bokningar utan inloggning, och inget för fel länk", async () => {
    const s = await db.query<{ id: string; link_token: string }>(
      "insert into staff (name, company, kind) values ('Kim', 'Städbolaget AB', 'leverantor') returning id, link_token",
    );
    await db.query(
      `insert into shifts (function_id, supplier_id, staff_kind, starts_at, ends_at, needed)
       values ((select id from staff_functions where name = 'Städ'), $1, 'leverantor', now() + interval '1 day', now() + interval '1 day 4 hours', 3)`,
      [s.rows[0].id],
    );
    await db.exec("set role anon");
    try {
      const r = await db.query<{ d: { company: string; shifts: { function: string; needed: number }[] } }>("select link_shifts($1) as d", [s.rows[0].link_token]);
      expect(r.rows[0].d.company).toBe("Städbolaget AB");
      expect(r.rows[0].d.shifts).toHaveLength(1);
      expect(r.rows[0].d.shifts[0]).toMatchObject({ function: "Städ", needed: 3 });
      const none = await db.query<{ d: unknown }>("select link_shifts(gen_random_uuid()) as d");
      expect(none.rows[0].d).toBeNull();
      await expect(db.query("select * from staff")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("tidrapport och attest", () => {
  const ANNA = "00000000-0000-0000-0000-0000000000c1";
  let shiftId = "";

  it("personal rapporterar tid på ett eget, påbörjat pass", async () => {
    const r = await db.query<{ id: string }>(
      `insert into shifts (function_id, starts_at, ends_at) values
       ((select id from staff_functions where name = 'Garderob'), '2026-09-12T16:00+02', '2026-09-12T23:00+02') returning id`,
    );
    shiftId = r.rows[0].id;
    await db.query(
      "insert into shift_assignments (shift_id, staff_id, status) values ($1, (select id from staff where email = 'anna@exempel.se'), 'tilldelad')",
      [shiftId],
    );
    await asUser(ANNA, async () => {
      const bad = await db.query<{ r: string }>("select portal_report_time($1, '2026-09-12T23:00+02', '2026-09-12T16:00+02', 0, null) as r", [shiftId]);
      expect(bad.rows[0].r).toBe("ogiltig_tid");
      const ok = await db.query<{ r: string }>("select portal_report_time($1, '2026-09-12T15:45+02', '2026-09-12T23:30+02', 30, 'Stannade kvar') as r", [shiftId]);
      expect(ok.rows[0].r).toBe("ok");
      const list = await db.query<{ s: { id: string; attest_status: string; break_minutes: number }[] }>("select portal_shifts() as s");
      expect(list.rows[0].s.find((x) => x.id === shiftId)).toMatchObject({ attest_status: "rapporterad", break_minutes: 30 });
    });
  });

  it("man kan inte attestera sin egen tid, men en annan planerare kan", async () => {
    await db.exec(`update profiles set role = 'produktion' where id = '${ANNA}'`);
    await asUser(ANNA, async () => {
      await expect(db.query("update shift_assignments set attest_status = 'attesterad' where shift_id = $1", [shiftId])).rejects.toThrow(/egen tid/);
    });
    await db.exec(`update profiles set role = 'personal' where id = '${ANNA}'`);
    await asUser(ADMIN, async () => {
      await db.query("update shift_assignments set attest_status = 'attesterad' where shift_id = $1", [shiftId]);
    });
    const r = await db.query<{ attested_by: string }>("select attested_by from shift_assignments where shift_id = $1", [shiftId]);
    expect(r.rows[0].attested_by).toBe(ADMIN);
  });

  it("en låst månad går inte att ändra", async () => {
    await db.exec("insert into time_periods (month, locked_at) values ('2026-09-01', now())");
    await expect(db.query("update shift_assignments set break_minutes = 0 where shift_id = $1", [shiftId])).rejects.toThrow(/låst/);
    await asUser(ANNA, async () => {
      const r = await db.query<{ r: string }>("select portal_report_time($1, '2026-09-12T16:00+02', '2026-09-12T23:00+02', 0, null) as r", [shiftId]);
      expect(r.rows[0].r).toBe("attesterad");
    });
    await db.exec("update time_periods set locked_at = null where month = '2026-09-01'");
    await expect(db.query("update shift_assignments set report_comment = 'ok' where shift_id = $1", [shiftId])).resolves.toBeTruthy();
  });
});

describe("appnotiser", () => {
  it("bara planerare kan hämta mottagare, och man ser bara sina egna prenumerationer", async () => {
    const ANNA = "00000000-0000-0000-0000-0000000000c1";
    await asUser(ANNA, async () => {
      await db.query("insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/anna', 'k', 'a')");
      const own = await db.query<{ n: number }>("select count(*)::int as n from push_subscriptions");
      expect(own.rows[0].n).toBe(1);
      const t = await db.query("select * from push_targets(array[(select my_staff_id())])");
      expect(t.rows).toHaveLength(0);
    });
    await asUser(ADMIN, async () => {
      const mine = await db.query<{ n: number }>("select count(*)::int as n from push_subscriptions");
      expect(mine.rows[0].n).toBe(0);
      const byFn = await db.query<{ endpoint: string }>(
        "select endpoint from push_targets(null, (select id from staff_functions where name = 'Garderob'))",
      );
      expect(byFn.rows.map((r) => r.endpoint)).toEqual(["https://push.example/anna"]);
    });
  });
});

describe("inbjudningskedja för frilans", () => {
  it("bjuder in i tur och ordning, går vidare vid nej och vid utgången svarstid", async () => {
    const people = await db.query<{ id: string; link_token: string; name: string }>(`
      insert into staff (name, email, kind) values
        ('Frida Ljud', 'frida@ljud.se', 'frilans'), ('Olle Ljud', 'olle@ljud.se', 'frilans'), ('Sara Ljud', 'sara@ljud.se', 'frilans')
      returning id, link_token, name`);
    const [frida, olle, sara] = people.rows;
    const sh = await db.query<{ id: string }>(
      `insert into shifts (function_id, staff_kind, starts_at, ends_at, needed, respond_hours)
       values ((select id from staff_functions where name = 'Ljudtekniker'), 'frilans', now() + interval '10 days', now() + interval '10 days 8 hours', 1, 24) returning id`,
    );
    const shift = sh.rows[0].id;
    for (const [i, p] of [frida, olle, sara].entries()) {
      await db.query("insert into shift_assignments (shift_id, staff_id, status, invite_order) values ($1, $2, 'vantar', $3)", [shift, p.id, i + 1]);
    }
    const status = async () =>
      (await db.query<{ name: string; status: string }>(
        "select s.name, a.status::text from shift_assignments a join staff s on s.id = a.staff_id where a.shift_id = $1 order by a.invite_order",
        [shift],
      )).rows.map((r) => `${r.name.split(" ")[0]}:${r.status}`);

    await db.query("select advance_invites($1)", [shift]);
    expect(await status()).toEqual(["Frida:inbjuden", "Olle:vantar", "Sara:vantar"]);
    const mail = await db.query<{ to_email: string; link: string }>("select to_email, link from email_outbox where shift_id = $1", [shift]);
    expect(mail.rows).toHaveLength(1);
    expect(mail.rows[0].to_email).toBe("frida@ljud.se");
    expect(mail.rows[0].link).toContain(`/pass/${frida.link_token}`);

    // Frida tackar nej via länken (utloggad) → Olle får frågan.
    await db.exec("set role anon");
    try {
      expect((await db.query<{ r: string }>("select link_respond($1, $2, false) as r", [frida.link_token, shift])).rows[0].r).toBe("ok");
    } finally {
      await db.exec("reset role");
    }
    expect(await status()).toEqual(["Frida:avbojd", "Olle:inbjuden", "Sara:vantar"]);

    // Olle svarar inte i tid → Sara får frågan och tackar ja.
    await db.query("update shift_assignments set respond_by = now() - interval '1 minute' where shift_id = $1 and staff_id = $2", [shift, olle.id]);
    await db.query("select advance_invites(null)");
    expect(await status()).toEqual(["Frida:avbojd", "Olle:utgangen", "Sara:inbjuden"]);
    await db.exec("set role anon");
    try {
      expect((await db.query<{ r: string }>("select link_respond($1, $2, true) as r", [sara.link_token, shift])).rows[0].r).toBe("ok");
      // Fel person kan inte svara.
      expect((await db.query<{ r: string }>("select link_respond($1, $2, true) as r", [olle.link_token, shift])).rows[0].r).toBe("ej_inbjuden");
    } finally {
      await db.exec("reset role");
    }
    expect(await status()).toEqual(["Frida:avbojd", "Olle:utgangen", "Sara:tilldelad"]);
  });

  it("leverantörspass skapar en bokning att bekräfta och ett mejl", async () => {
    const s = await db.query<{ id: string; link_token: string }>(
      "insert into staff (name, company, email, kind) values ('Lena', 'Rent & Fint AB', 'lena@rent.se', 'leverantor') returning id, link_token",
    );
    const sh = await db.query<{ id: string }>(
      `insert into shifts (function_id, supplier_id, staff_kind, starts_at, ends_at, needed)
       values ((select id from staff_functions where name = 'Städ'), $1, 'leverantor', now() + interval '3 days', now() + interval '3 days 4 hours', 4) returning id`,
      [s.rows[0].id],
    );
    const a = await db.query<{ status: string }>("select status::text from shift_assignments where shift_id = $1", [sh.rows[0].id]);
    expect(a.rows[0].status).toBe("inbjuden");
    const m = await db.query<{ subject: string }>("select subject from email_outbox where shift_id = $1", [sh.rows[0].id]);
    expect(m.rows[0].subject).toMatch(/^Ny bokning: Städ /);
    await db.exec("set role anon");
    try {
      expect((await db.query<{ r: string }>("select link_respond($1, $2, true) as r", [s.rows[0].link_token, sh.rows[0].id])).rows[0].r).toBe("ok");
    } finally {
      await db.exec("reset role");
    }
    const b = await db.query<{ status: string }>("select status::text from shift_assignments where shift_id = $1", [sh.rows[0].id]);
    expect(b.rows[0].status).toBe("tilldelad");
  });
});

describe("eventlänk", () => {
  it("öppnas när evenemanget är bekräftat och visar offerter, checklista och bara publika dokument", async () => {
    const ev = await book("Årsmöte", "preliminar", "Birka", "2027-08-20T09:00+02", "2027-08-20T17:00+02");
    const tok = (await db.query<{ share_token: string }>("select share_token from events where id = $1", [ev])).rows[0].share_token;
    await db.query("insert into event_checklist (event_id, title, due_date) values ($1, 'Slutligt antal gäster', '2027-08-06')", [ev]);
    await db.query("insert into event_checklist (event_id, title, customer_visible) values ($1, 'Intern punkt', false)", [ev]);
    await db.query("insert into event_documents (event_id, name, storage_path, public) values ($1, 'Program.pdf', 'x/program.pdf', true), ($1, 'Intern kalkyl.xlsx', 'x/kalkyl.xlsx', false)", [ev]);
    await db.query("insert into quotes (title, status, event_id) values ('Årsmöte', 'skickad', $1), ('Utkast', 'utkast', $1)", [ev]);

    await db.exec("set role anon");
    try {
      const closed = await db.query<{ d: unknown }>("select event_portal($1) as d", [tok]);
      expect(closed.rows[0].d).toBeNull();
    } finally {
      await db.exec("reset role");
    }
    await db.query("update events set status = 'bekraftad' where id = $1", [ev]);
    const docId = async (n: string) => (await db.query<{ id: string }>("select id from event_documents where name = $1", [n])).rows[0].id;
    const pubId = await docId("Program.pdf");
    const privId = await docId("Intern kalkyl.xlsx");
    await db.exec("set role anon");
    try {
      const r = await db.query<{ d: { checklist: { id: string; title: string }[]; documents: { name: string }[]; quotes: { title: string }[]; bookings: unknown[] } }>(
        "select event_portal($1) as d",
        [tok],
      );
      const d = r.rows[0].d;
      expect(d.bookings).toHaveLength(1);
      expect(d.checklist.map((x) => x.title)).toEqual(["Slutligt antal gäster"]);
      expect(d.documents.map((x) => x.name)).toEqual(["Program.pdf"]);
      expect(d.quotes.map((x) => x.title)).toEqual(["Årsmöte"]);
      expect(JSON.stringify(d)).not.toMatch(/internal_notes|cost/);
      expect((await db.query<{ r: string }>("select event_portal_check($1, $2, true, 'Kund') as r", [tok, d.checklist[0].id])).rows[0].r).toBe("ok");
      const pub = await db.query<{ p: string | null }>("select document_for_link($1, $2) as p", [tok, pubId]);
      expect(pub.rows[0].p).toBe("x/program.pdf");
      const priv = await db.query<{ p: string | null }>("select document_for_link($1, $2) as p", [tok, privId]);
      expect(priv.rows[0].p).toBeNull();
    } finally {
      await db.exec("reset role");
    }
    const done = await db.query<{ done_by: string }>("select done_by from event_checklist where title = 'Slutligt antal gäster'");
    expect(done.rows[0].done_by).toBe("Kund");
  });

  it("personal ser evenemangets information men inga priser", async () => {
    const ANNA = "00000000-0000-0000-0000-0000000000c1";
    const ev = (await db.query<{ id: string }>("select id from events where title = 'Årsmöte'")).rows[0].id;
    await db.query("update events set technical_info = 'Två mikrofoner', internal_notes = 'Hemligt' where id = $1", [ev]);
    const sh = await db.query<{ id: string }>(
      `insert into shifts (event_id, function_id, starts_at, ends_at) values ($1, (select id from staff_functions where name = 'Garderob'), '2027-08-20T08:00+02', '2027-08-20T18:00+02') returning id`,
      [ev],
    );
    await db.query("insert into shift_assignments (shift_id, staff_id, status) values ($1, (select id from staff where email = 'anna@exempel.se'), 'tilldelad')", [sh.rows[0].id]);
    await asUser(ANNA, async () => {
      const r = await db.query<{ s: { id: string; event_info: Record<string, unknown> | null }[] }>("select portal_shifts() as s");
      const info = r.rows[0].s.find((x) => x.id === sh.rows[0].id)!.event_info!;
      expect(info.technical_info).toBe("Två mikrofoner");
      expect(JSON.stringify(info)).not.toMatch(/Hemligt|price|cost|quote/);
    });
  });
});

describe("bildbank och bilder per evenemangstyp", () => {
  it("FCC:s foton finns i banken och en bild kan bytas överallt på en gång", async () => {
    const n = await db.query<{ n: number }>("select count(*)::int as n from media_images where url like '/lokaler/%'");
    expect(n.rows[0].n).toBe(13);
    await db.query("update rooms set image_path = '/lokaler/birka.jpg' where name = 'Birka'");
    await db.query("insert into app_settings (key, value) values ('look_cover', '/lokaler/birka.jpg') on conflict (key) do update set value = excluded.value");
    const ny = "https://x.supabase.co/storage/v1/object/public/lokaler/bildbank/ny.jpg";
    await expect(asUser(LASARE, () => db.query("select replace_image('/lokaler/birka.jpg', $1)", [ny]))).rejects.toThrow();
    const r = await asUser(ADMIN, () => db.query<{ n: number }>("select replace_image('/lokaler/birka.jpg', $1) as n", [ny]));
    expect(r.rows[0].n).toBeGreaterThanOrEqual(2);
    expect((await db.query<{ image_path: string }>("select image_path from rooms where name = 'Birka'")).rows[0].image_path).toBe(ny);
    expect((await db.query<{ value: string }>("select value from app_settings where key = 'look_cover'")).rows[0].value).toBe(ny);
    expect((await db.query("select 1 from media_images where url = $1", [ny])).rows).toHaveLength(1);
  });

  it("evenemangstypens omslag används i offerten och på eventlänken", async () => {
    await db.query("update event_types set cover_image = '/lokaler/stora-salen.jpg' where id = 'konsert'");
    const ev = await book("Julkonsert", "bekraftad", "Birka", "2027-12-10T18:00+01", "2027-12-10T22:00+01");
    await db.query("update events set event_type_id = 'konsert' where id = $1", [ev]);
    const q = await db.query<{ id: string }>("insert into quotes (title, status, event_id) values ('Julkonsert', 'skickad', $1) returning id", [ev]);
    const doc = await asUser(ADMIN, () => db.query<{ d: { event_type: string; settings: Record<string, string> } }>("select quote_doc($1) as d", [q.rows[0].id]));
    expect(doc.rows[0].d.event_type).toBe("Konsert");
    expect(doc.rows[0].d.settings.look_cover).toBe("/lokaler/stora-salen.jpg");
    const tok = (await db.query<{ share_token: string }>("select share_token from events where id = $1", [ev])).rows[0].share_token;
    const p = await db.query<{ d: { settings: Record<string, string> } }>("select event_portal($1) as d", [tok]);
    expect(p.rows[0].d.settings.look_cover).toBe("/lokaler/stora-salen.jpg");
  });
});

describe("optioner i turordning", () => {
  it("två preliminära på samma tid krockar inte utan står i kö, och kön går att ordna om", async () => {
    const a = await book("Option A", "preliminar", "Karlbergssalen", "2027-09-10T09:00+02", "2027-09-10T17:00+02");
    const b = await book("Option B", "forfragan", "Karlbergssalen", "2027-09-10T12:00+02", "2027-09-10T20:00+02");
    const c = await db.query("select 1 from booking_conflicts where event_id in ($1, $2)", [a, b]);
    expect(c.rows).toHaveLength(0);

    const q = await db.query<{ title: string; place: number }>("select title, place from option_queue($1)", [b]);
    expect(q.rows).toEqual([{ title: "Option A", place: 1 }, { title: "Option B", place: 2 }]);
    await db.query("update events set option_rank = 1 where id = $1", [b]);
    await db.query("update events set option_rank = 2 where id = $1", [a]);
    const q2 = await db.query<{ title: string }>("select title from option_queue($1)", [a]);
    expect(q2.rows.map((r) => r.title)).toEqual(["Option B", "Option A"]);
    const places = await db.query<{ event_id: string; place: number; shared: boolean }>("select * from option_places where event_id in ($1, $2) order by place", [a, b]);
    expect(places.rows.map((r) => [r.event_id, r.place, r.shared])).toEqual([[b, 1, true], [a, 2, true]]);

    // När den ena bekräftas blir den andra en riktig krock.
    await db.query("update events set status = 'bekraftad' where id = $1", [b]);
    const c2 = await db.query("select 1 from booking_conflicts where event_id = $1", [a]);
    expect(c2.rows.length).toBeGreaterThan(0);
  });
});

describe("notiser", () => {
  it("kundens svar på offerten och personalens ja ger notiser, men inte planerarens egna ändringar", async () => {
    const q = await db.query<{ id: string; share_token: string }>(
      "insert into quotes (title, status, salesperson_id) values ('Notistest', 'skickad', $1) returning id, share_token",
      [ADMIN],
    );
    await db.query("update profiles set notify_kinds = '{offert,pass,tid,checklista}' where id = $1", [ADMIN]);
    await db.exec("set role anon");
    try {
      await db.query("select respond_to_quote($1, true, 'Kim Kund', 'kim@kund.se', '')", [q.rows[0].share_token]);
    } finally {
      await db.exec("reset role");
    }
    const n = await db.query<{ title: string; profile_id: string }>("select title, profile_id from notifications where kind = 'offert'");
    expect(n.rows.map((r) => r.title)).toContain(`Offert ${(await db.query<{ number: number }>("select number from quotes where id = $1", [q.rows[0].id])).rows[0].number} accepterad`);
    expect(n.rows.every((r) => r.profile_id === ADMIN)).toBe(true);

    const before = (await db.query<{ n: number }>("select count(*)::int n from notifications where kind = 'pass'")).rows[0].n;
    // Planeraren tilldelar själv: ingen notis.
    const sh = await db.query<{ id: string }>(
      "insert into shifts (function_id, starts_at, ends_at, staff_kind) values ((select id from staff_functions where name = 'Kiosk'), '2027-10-01T10:00+02', '2027-10-01T14:00+02', 'frilans') returning id",
    );
    const st = await db.query<{ id: string; link_token: string }>("insert into staff (kind, name, email) values ('frilans', 'Frida Frilans', 'frida@x.se') returning id, link_token");
    await asUser(ADMIN, () => db.query("insert into shift_assignments (shift_id, staff_id, status) values ($1, $2, 'inbjuden')", [sh.rows[0].id, st.rows[0].id]));
    expect((await db.query<{ n: number }>("select count(*)::int n from notifications where kind = 'pass'")).rows[0].n).toBe(before);
    // Frilansaren tackar ja via sin länk: notis.
    await db.exec("set role anon");
    try {
      await db.query("select link_respond($1, $2, true)", [st.rows[0].link_token, sh.rows[0].id]);
    } finally {
      await db.exec("reset role");
    }
    const p = await db.query<{ title: string }>("select title from notifications where kind = 'pass' order by created_at desc limit 1");
    expect(p.rows[0].title).toBe("Frida Frilans tackade ja");

    // Hämtning av appnotiser kräver rätt nyckel.
    await db.query("insert into app_secrets values ('push_claim', 'hemligt')");
    await db.exec("set role anon");
    try {
      expect((await db.query("select * from claim_pushes('fel')")).rows).toHaveLength(0);
      await db.query("select * from claim_pushes('hemligt')");
    } finally {
      await db.exec("reset role");
    }
    expect((await db.query<{ n: number }>("select count(*)::int n from notifications where pushed_at is null")).rows[0].n).toBe(0);
  });
});

describe("personalens uppgifter", () => {
  it("frilans fyller i via länken, ser bara maskat personnummer, och planerare ser inte bankkonto", async () => {
    const st = await db.query<{ id: string; link_token: string }>("insert into staff (kind, name) values ('frilans', 'Uppgift Testsson') returning id, link_token");
    const tok = st.rows[0].link_token;
    await db.exec("set role anon");
    try {
      const r = await db.query<{ r: string }>(
        "select link_details_save($1, $2::jsonb) as r",
        [tok, JSON.stringify({ address: "Gatan 1", ice_name: "Mamma", ice_phone: "070", personal_number: "199001011234", account_number: "1234567890", clearing_number: "8327", f_tax: "on" })],
      );
      expect(r.rows[0].r).toBe("ok");
      const d = await db.query<{ d: Record<string, unknown> }>("select link_details($1) as d", [tok]);
      expect(d.rows[0].d.address).toBe("Gatan 1");
      expect(d.rows[0].d.personal_number_masked).toBe("199001-••••");
      expect(JSON.stringify(d.rows[0].d)).not.toContain("1234567890");
      // Tomt fält skriver inte över det sparade.
      await db.query("select link_details_save($1, $2::jsonb)", [tok, JSON.stringify({ address: "Gatan 2" })]);
    } finally {
      await db.exec("reset role");
    }
    const saved = await db.query<{ personal_number: string; address: string }>("select personal_number, address from staff_details where staff_id = $1", [st.rows[0].id]);
    expect(saved.rows[0]).toEqual({ personal_number: "199001011234", address: "Gatan 2" });
    const basic = await asUser(ADMIN, () => db.query<{ b: Record<string, unknown> }>("select staff_details_basic($1) as b", [st.rows[0].id]));
    expect(basic.rows[0].b.has_bank).toBe(true);
    expect(JSON.stringify(basic.rows[0].b)).not.toContain("1234567890");
  });
});

describe("uppgifter och relativa datum", () => {
  it("datum räknas från första bokningen och följer med när bokningen flyttas; påminnelse till ansvarig", async () => {
    const ev = await book("Uppgiftstest", "bekraftad", "Birka", "2027-11-20T09:00+01", "2027-11-20T17:00+01");
    await db.query("insert into event_checklist (event_id, title, days_before, assignee_id, customer_visible) values ($1, 'Beställ blommor', 14, $2, false)", [ev, ADMIN]);
    const d = async () => (await db.query<{ due_date: string }>("select to_char(due_date, 'YYYY-MM-DD') as due_date from event_checklist where title = 'Beställ blommor'")).rows[0].due_date;
    expect(await d()).toBe("2027-11-06");
    await db.query("update bookings set starts_at = '2027-11-27T09:00+01', ends_at = '2027-11-27T17:00+01' where event_id = $1", [ev]);
    expect(await d()).toBe("2027-11-13");
    // Flytta till i dag så att påminnelsen går.
    await db.query("update event_checklist set days_before = null, due_date = current_date where title = 'Beställ blommor'");
    await db.query("update profiles set notify_kinds = '{offert,pass,tid,checklista,uppgift}' where id = $1", [ADMIN]);
    const n = await db.query<{ n: number }>("select remind_due_tasks() as n");
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
    const note = await db.query<{ title: string }>("select title from notifications where kind = 'uppgift' and profile_id = $1 order by created_at desc limit 1", [ADMIN]);
    expect(note.rows[0].title).toBe("I dag: Beställ blommor");
  });
});

describe("offertens egna lokaler", () => {
  it("offertens lokaler blir programmet; utan egna lokaler används evenemangets bokningar", async () => {
    const q = await db.query<{ id: string }>("insert into quotes (title, status) values ('Lokaltest', 'skickad') returning id");
    await db.query("insert into quote_rooms (quote_id, room_id, starts_at, ends_at) values ($1, (select id from rooms where name = 'Birka'), '2028-01-10T09:00+01', '2028-01-10T12:00+01')", [q.rows[0].id]);
    const d = await asUser(ADMIN, () => db.query<{ d: { bookings: { room: string }[]; rooms: { name: string }[] } }>("select quote_doc($1) as d", [q.rows[0].id]));
    expect(d.rows[0].d.bookings.map((b) => b.room)).toEqual(["Birka"]);
    expect(d.rows[0].d.rooms.map((r) => r.name)).toEqual(["Birka"]);
  });
});

describe("fakturaunderlag", () => {
  it("numreras, summeras och låses när det skickats", async () => {
    const ev = (await db.query<{ id: string }>("insert into events (title, status) values ('Faktura-test', 'bekraftad') returning id")).rows[0].id;
    const inv = await asUser(ADMIN, () => db.query<{ id: string; number: number }>("insert into invoices (event_id, kind, percent) values ($1, 'del', 30) returning id, number", [ev]));
    expect(inv.rows[0].number).toBeGreaterThanOrEqual(1001);
    const id = inv.rows[0].id;
    await db.query("insert into invoice_lines (invoice_id, description, quantity, unit_price, vat_rate) values ($1, 'Förskott', 1, 3000, 25), ($1, 'Avgår', 1, -1000, 25)", [id]);
    const o = await db.query<{ total_ex_vat: string; total_vat: string }>("select total_ex_vat, total_vat from invoice_overview where id = $1", [id]);
    expect(Number(o.rows[0].total_ex_vat)).toBe(2000);
    expect(Number(o.rows[0].total_vat)).toBe(500);
    await db.query("update invoices set status = 'skickad' where id = $1", [id]);
    await expect(db.query("insert into invoice_lines (invoice_id, description) values ($1, 'Sent')", [id])).rejects.toThrow(/skickat/);
  });
});

describe("personalinfo", () => {
  it("koder visas bara när personen har ett pass nära i tid", async () => {
    const st = await db.query<{ id: string; link_token: string }>("insert into staff (kind, name) values ('frilans', 'Info Frilans') returning id, link_token");
    const titles = async () => {
      await db.exec("set role anon");
      try {
        const r = await db.query<{ d: { title: string }[] }>("select link_staff_info($1) as d", [st.rows[0].link_token]);
        return r.rows[0].d.map((x) => x.title);
      } finally {
        await db.exec("reset role");
      }
    };
    expect(await titles()).not.toContain("Koder");
    expect(await titles()).toContain("Personalmat");
    const sh = await db.query<{ id: string }>(
      "insert into shifts (function_id, starts_at, ends_at, staff_kind) values ((select id from staff_functions where name = 'Kiosk'), now() + interval '3 hours', now() + interval '8 hours', 'frilans') returning id",
    );
    await db.query("insert into shift_assignments (shift_id, staff_id, status) values ($1, $2, 'tilldelad')", [sh.rows[0].id, st.rows[0].id]);
    expect(await titles()).toContain("Koder");
  });
});

describe("möbleringsritningar", () => {
  it("räknar ställ-listan med stolar runt borden och följer med till personalen", async () => {
    const counts = await db.query<{ c: Record<string, number> }>(
      `select layout_counts('[{"t":"rund180","chairs":10},{"t":"rund180","chairs":8},{"t":"stol"},{"t":"stol"},{"t":"scen"}]'::jsonb) as c`,
    );
    expect(counts.rows[0].c).toEqual({ rund180: 2, scen: 1, stol: 20 });
    const birka = await roomId("Birka");
    const ev = (await db.query<{ id: string }>("insert into events (title, status) values ('Ritning-test', 'bekraftad') returning id")).rows[0].id;
    await asUser(ADMIN, () =>
      db.query("insert into layouts (name, room_id, event_id, items) values ('Bankett', $1, $2, '[{\"t\":\"rund180\",\"chairs\":10}]')", [birka, ev]),
    );
    const info = await db.query<{ d: { layouts: { name: string; room: string }[] } }>("select event_staff_info($1) as d", [ev]);
    expect(info.rows[0].d.layouts.map((l) => `${l.name} ${l.room}`)).toEqual(["Bankett Birka"]);
  });

  it("läsare kan se men inte rita", async () => {
    const birka = await roomId("Birka");
    await asUser(LASARE, async () => {
      await expect(db.query("insert into layouts (name, room_id) values ('Nej', $1)", [birka])).rejects.toThrow();
      const r = await db.query("select * from furniture_types");
      expect(r.rows.length).toBeGreaterThan(10);
    });
  });
});

describe("omställning och rigg/riv", () => {
  it("varnar när tiden mellan två bokningar i samma lokal är kortare än riv + omställning + rigg", async () => {
    const a = await book("Omst A", "bekraftad", "Birka", "2028-02-01T09:00+01", "2028-02-01T12:00+01");
    const b = await book("Omst B", "preliminar", "Birka", "2028-02-01T13:00+01", "2028-02-01T17:00+01");
    await db.query("update bookings set setup_id = 'bio' where event_id = $1", [a]);
    await db.query("update bookings set setup_id = 'runda' where event_id = $1", [b]);
    const w = async () =>
      (await db.query<{ gap_minutes: number; needed_minutes: number; event_title: string }>(
        "select gap_minutes, needed_minutes, event_title from changeover_warnings where event_id = $1", [a])).rows;
    // bio -> runda: 120 min, bara 60 min emellan.
    expect(await w()).toEqual([{ gap_minutes: 60, needed_minutes: 120, event_title: "Omst A" }]);
    // Eget par 45 min räcker.
    await db.query("insert into setup_changeovers (from_setup, to_setup, minutes) values ('bio', 'runda', 45)");
    expect(await w()).toEqual([]);
    // Rigg på nästa bokning gör det för kort igen.
    await db.query("update bookings set rig_minutes = 30 where event_id = $1", [b]);
    expect((await w())[0].needed_minutes).toBe(75);
    // Samma möblering och ingen rigg: ingen varning.
    await db.query("update bookings set rig_minutes = 0, setup_id = 'bio' where event_id = $1", [b]);
    expect(await w()).toEqual([]);
  });
});

describe("möbler per dag", () => {
  it("summerar ritningarna samma dag över evenemang och tar högsta antalet inom ett evenemang", async () => {
    await db.query("update furniture_types set stock = 25 where id = 'stol'");
    const a = await book("Lager A", "bekraftad", "Birka", "2028-03-01T09:00+01", "2028-03-01T17:00+01");
    const b = await book("Lager B", "preliminar", "Stora salen", "2028-03-01T18:00+01", "2028-03-01T22:00+01");
    const birka = await roomId("Birka");
    const stora = await roomId("Stora salen");
    await db.query(`insert into layouts (name, room_id, event_id, items) values
      ('Teater', $1, $2, '[{"t":"stol"},{"t":"stol"},{"t":"stol"}]'),
      ('Bankett', $1, $2, '[{"t":"rund180","chairs":10}]'),
      ('Middag', $3, $4, '[{"t":"rund180","chairs":10},{"t":"rund180","chairs":10}]')`, [birka, a, stora, b]);
    const r = await db.query<{ furniture_id: string; needed: number; stock: number | null }>(
      "select furniture_id, needed, stock from furniture_by_day('2028-03-01', '2028-03-01') order by furniture_id");
    expect(r.rows).toEqual([
      { furniture_id: "rund180", needed: 3, stock: null },
      { furniture_id: "stol", needed: 30, stock: 25 },
    ]);
  });
});

describe("körschema", () => {
  it("visar kundens och personalens punkter på eventlänken och i personalinfon", async () => {
    const ev = await book("Körschema-test", "bekraftad", "Birka", "2028-04-01T17:00+02", "2028-04-01T23:00+02");
    await db.query(`insert into run_sheet_items (event_id, starts_at, title, customer_visible, staff_visible) values
      ($1, '2028-04-01T18:00+02', 'Insläpp', true, true),
      ($1, '2028-04-01T17:30+02', 'Personalgenomgång', false, true),
      ($1, '2028-04-01T19:00+02', 'Middag', true, false)`, [ev]);
    const tok = (await db.query<{ share_token: string }>("select share_token from events where id = $1", [ev])).rows[0].share_token;
    await db.exec("set role anon");
    try {
      const p = await db.query<{ d: { title: string; run_sheet: { title: string }[] } }>("select event_portal($1) as d", [tok]);
      expect(p.rows[0].d.title).toBe("Körschema-test");
      expect(p.rows[0].d.run_sheet.map((x) => x.title)).toEqual(["Insläpp", "Middag"]);
    } finally {
      await db.exec("reset role");
    }
    const s = await db.query<{ d: { run_sheet: { title: string }[]; layouts: unknown[] } }>("select event_staff_info($1) as d", [ev]);
    expect(s.rows[0].d.run_sheet.map((x) => x.title)).toEqual(["Personalgenomgång", "Insläpp"]);
    expect(Array.isArray(s.rows[0].d.layouts)).toBe(true);
  });
});

describe("personalens tillgänglighet", () => {
  it("frilansaren markerar ledigt via länken och kedjan hoppar över hen", async () => {
    const people = await db.query<{ id: string; link_token: string }>(`
      insert into staff (name, email, kind) values ('Ledig Lisa', 'lisa@x.se', 'frilans'), ('Kalle Kan', 'kalle@x.se', 'frilans')
      returning id, link_token`);
    const [lisa, kalle] = people.rows;
    const sh = await db.query<{ id: string; starts_at: string; ends_at: string }>(
      `insert into shifts (function_id, staff_kind, starts_at, ends_at, needed)
       values ((select id from staff_functions where name = 'Ljudtekniker'), 'frilans', now() + interval '20 days', now() + interval '20 days 6 hours', 1)
       returning id, starts_at::text, ends_at::text`,
    );
    await db.exec("set role anon");
    try {
      const r = await db.query<{ r: string }>("select link_unavailability_add($1, now() + interval '19 days', now() + interval '21 days', 'Semester') as r", [lisa.link_token]);
      expect(r.rows[0].r).toBe("ok");
      const list = await db.query<{ l: { note: string }[] }>("select link_unavailability($1) as l", [lisa.link_token]);
      expect(list.rows[0].l.map((x) => x.note)).toEqual(["Semester"]);
    } finally {
      await db.exec("reset role");
    }
    const shift = sh.rows[0].id;
    await db.query("insert into shift_assignments (shift_id, staff_id, status, invite_order) values ($1, $2, 'vantar', 1), ($1, $3, 'vantar', 2)", [shift, lisa.id, kalle.id]);
    await db.query("select advance_invites($1)", [shift]);
    const st = await db.query<{ staff_id: string; status: string }>("select staff_id, status::text from shift_assignments where shift_id = $1 order by invite_order", [shift]);
    expect(st.rows.map((x) => x.status)).toEqual(["vantar", "inbjuden"]);
    const why = await asUser(ADMIN, () => db.query<{ r: string }>("select staff_busy_reason($1, $2::timestamptz, $3::timestamptz) as r", [lisa.id, sh.rows[0].starts_at, sh.rows[0].ends_at]));
    expect(why.rows[0].r).toBe("Ledig: Semester");
  });
});

describe("optionsbevakning", () => {
  it("påminner kunden, och när kunden släpper får nästa i kön besked", async () => {
    const c = await db.query<{ id: string }>("insert into contacts (name, email) values ('Anna Kund', 'anna@kund.se'), ('Bo Nästa', 'bo@nasta.se') returning id");
    const first = await book("Option ett", "preliminar", "Birka", "2099-05-10T09:00+02", "2099-05-10T17:00+02");
    const second = await book("Option två", "preliminar", "Birka", "2099-05-10T10:00+02", "2099-05-10T15:00+02");
    await db.query("update events set contact_id = $2, responsible_id = $3, option_expires_on = current_date + 2 where id = $1", [first, c.rows[0].id, ADMIN]);
    await db.query("update events set contact_id = $2, created_at = now() + interval '1 second' where id = $1", [second, c.rows[1].id]);
    await db.query("update profiles set notify_kinds = '{option}' where id = $1", [ADMIN]);
    const n = await db.query<{ n: number }>("select remind_options() as n");
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
    const m1 = await db.query<{ to_email: string; link: string }>("select to_email, link from email_outbox where event_id = $1 and kind = 'option'", [first]);
    expect(m1.rows.map((x) => x.to_email)).toEqual(["anna@kund.se"]);
    const tok = m1.rows[0].link.split("/option/")[1];
    await db.exec("set role anon");
    try {
      const info = await db.query<{ d: { title: string } }>("select option_info($1) as d", [tok]);
      expect(info.rows[0].d.title).toBe("Option ett");
      expect((await db.query<{ r: string }>("select option_respond($1, 'slapper', 'Anna') as r", [tok])).rows[0].r).toBe("ok");
    } finally {
      await db.exec("reset role");
    }
    const st = await db.query<{ status: string }>("select status::text from events where id = $1", [first]);
    expect(st.rows[0].status).toBe("avbokad");
    const m2 = await db.query<{ to_email: string }>("select to_email from email_outbox where event_id = $1 and kind = 'option'", [second]);
    expect(m2.rows.map((x) => x.to_email)).toEqual(["bo@nasta.se"]);
    const notes = await db.query<{ title: string }>("select title from notifications where profile_id = $1 and kind = 'option' order by created_at", [ADMIN]);
    expect(notes.rows.map((x) => x.title)).toContain("Kunden släppte optionen: Option ett");
  });
});

describe("lokalkort och felanmälan", () => {
  it("visar kortet utan inloggning och tar emot en felanmälan som admin får notis om", async () => {
    const birka = await roomId("Birka");
    await db.query("update rooms set card_info = 'Ljuset tänds vid dörren', contact_info = 'Ring 070-000' where id = $1", [birka]);
    await db.query("update profiles set notify_kinds = '{fel}' where id = $1", [ADMIN]);
    const tok = (await db.query<{ card_token: string }>("select card_token from rooms where id = $1", [birka])).rows[0].card_token;
    await db.exec("set role anon");
    try {
      const c = await db.query<{ d: { name: string; card_info: string } }>("select room_card($1) as d", [tok]);
      expect(c.rows[0].d.name).toBe("Birka");
      expect(c.rows[0].d.card_info).toBe("Ljuset tänds vid dörren");
      const r = await db.query<{ r: string }>("select report_room_issue($1, 'Trasig lampa', 'Vänster spot', 'Olle', null, 'fel/x.jpg') as r", [tok]);
      expect(r.rows[0].r).toBe("ok");
      await expect(db.query("select * from room_issues")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
    const i = await db.query<{ title: string; photo_path: string }>("select title, photo_path from room_issues where room_id = $1", [birka]);
    expect(i.rows).toEqual([{ title: "Trasig lampa", photo_path: "fel/x.jpg" }]);
    const n = await db.query<{ title: string }>("select title from notifications where profile_id = $1 and kind = 'fel'", [ADMIN]);
    expect(n.rows.map((x) => x.title)).toEqual(["Felanmälan i Birka: Trasig lampa"]);
  });
});

describe("öppna och stänga huset", () => {
  it("frilans bockar av via länken, avvikelse kräver kommentar, och signerar", async () => {
    const st = (await db.query<{ id: string; link_token: string }>("insert into staff (name, kind) values ('Rutin Rut', 'frilans') returning id, link_token")).rows[0];
    const r = (await db.query<{ id: string }>("select id from routines where name = 'Stänga huset'")).rows[0].id;
    const steps = (await db.query<{ id: string }>("select id from routine_steps where routine_id = $1 order by sort_order", [r])).rows;
    await db.exec("set role anon");
    try {
      let run = "";
      for (const [i, s] of steps.entries()) {
        const res = await db.query<{ r: string }>("select link_routine_check($1, $2, $3, $4, $5) as r", [st.link_token, r, s.id, i !== 2, null]);
        run = res.rows[0].r;
      }
      expect((await db.query<{ r: string }>("select link_routine_sign($1, $2, 'Rut', null) as r", [st.link_token, run])).rows[0].r).toBe("ej_klar");
      await db.query("select link_routine_check($1, $2, $3, false, 'Kaffebryggaren gick inte att stänga av, ringde Pontus')", [st.link_token, r, steps[2].id]);
      expect((await db.query<{ r: string }>("select link_routine_sign($1, $2, 'Rut', null) as r", [st.link_token, run])).rows[0].r).toBe("ok");
      const list = await db.query<{ d: { name: string; runs: { signed_name: string; mine: boolean }[] }[] }>("select link_routines($1) as d", [st.link_token]);
      const closing = list.rows[0].d.find((x) => x.name === "Stänga huset")!;
      expect(closing.runs[0].signed_name).toBe("Rut");
      expect(closing.runs[0].mine).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("statistik", () => {
  it("räknar beläggning per lokal och månad samt vunna offerter per kategori", async () => {
    const ev = await book("Statistik-test", "bekraftad", "Birka", "2031-06-10T09:00+02", "2031-06-11T17:00+02");
    const co = (await db.query<{ id: string }>("insert into companies (name, categories) values ('Stat AB', '{Eventbyrå}') returning id")).rows[0].id;
    const q = (await db.query<{ id: string }>("insert into quotes (title, status, company_id, event_id, accepted_at, sent_at) values ('S', 'accepterad', $1, $2, '2031-03-05', '2031-03-01') returning id", [co, ev])).rows[0].id;
    await db.query("insert into quote_lines (quote_id, description, quantity, unit_price, group_id) values ($1, 'Lokal', 1, 10000, (select id from article_groups limit 1))", [q]);
    const s = await asUser(ADMIN, () => db.query<{ d: { occupancy: { room: string; months: { m: number; days: number; hours: number }[] }[]; quotes: { m: number; won_value: number }[]; by_category: { category: string; value: number }[] } }>("select stats_year(2031) as d"));
    const d = s.rows[0].d;
    const birka = d.occupancy.find((x) => x.room === "Birka")!;
    expect(birka.months[5]).toMatchObject({ m: 6, days: 2 });
    expect(Number(birka.months[5].hours)).toBe(32);
    expect(Number(d.quotes[2].won_value)).toBe(10000);
    expect(d.by_category).toEqual([{ category: "Eventbyrå", count: 1, value: 10000 }]);
  });
});

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
    expect((await q("Lounge 1", "Rörstrandssalarna, hela")).rows[0].x).toBe(true);
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

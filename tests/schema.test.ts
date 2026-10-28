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
    expect(r.rows[0].n).toBe(19);
  });

  it("vet att delar av en sal krockar med hela salen", async () => {
    const q = (a: string, b: string) =>
      db.query<{ x: boolean }>("select rooms_overlap((select id from rooms where name=$1),(select id from rooms where name=$2)) as x", [a, b]);
    expect((await q("Läktare", "Stora salen, hela")).rows[0].x).toBe(true);
    expect((await q("Stora salen, hela", "Balkong")).rows[0].x).toBe(true);
    expect((await q("Läktare", "Balkong")).rows[0].x).toBe(false);
    expect((await q("Lounge 1", "Rörstrandssalarna, hela")).rows[0].x).toBe(true);
    expect((await q("Birka", "Rörstrand 1")).rows[0].x).toBe(false);
  });
});

describe("krockkontroll", () => {
  it("hittar krock mellan hel sal och delyta, men inte mellan avbokade", async () => {
    await book("Konsert", "bekraftad", "Stora salen, hela", "2027-03-01T12:00+01", "2027-03-01T23:00+01");
    await book("Mässa", "preliminar", "Läktare", "2027-03-01T09:00+01", "2027-03-01T13:00+01");
    await book("Gammal", "avbokad", "Balkong", "2027-03-01T15:00+01", "2027-03-01T16:00+01");
    await book("Kväll", "bekraftad", "Läktare", "2027-03-02T09:00+01", "2027-03-02T13:00+01");

    const c = await db.query<{ event_title: string; other_event_title: string }>(
      "select event_title, other_event_title from booking_conflicts order by event_title",
    );
    expect(c.rows).toEqual([
      { event_title: "Konsert", other_event_title: "Mässa" },
      { event_title: "Mässa", other_event_title: "Konsert" },
    ]);

    const pre = await db.query<{ event_title: string }>(
      "select event_title from check_conflicts((select id from rooms where name='Balkong'), '2027-03-01T22:00+01', '2027-03-01T23:30+01')",
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
    expect(r.rows[0].linked).toBe(12);
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

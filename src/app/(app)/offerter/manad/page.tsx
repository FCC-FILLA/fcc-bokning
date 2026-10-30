import Link from "next/link";
import { requireBooker } from "@/lib/auth";
import { fmtDate, fmtTime, todayDate } from "@/lib/datum";
import { QUOTE_STATUS_LABEL, fmtKr, type QuoteStatus } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { createMonthlyQuote } from "./actions";

export const metadata = { title: "Månadsoffert" };

type Line = {
  booking_id: string; event_id: string; event_title: string; room_name: string; starts_at: string; ends_at: string;
  hours: number; rig_hours: number; capped: boolean; day_price: number | null; hourly: number; discount_pct: number; vat_rate: number;
};
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const shift = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const h = (n: number) => Number(n).toLocaleString("sv-SE", { maximumFractionDigits: 2 });

export default async function MonthlyQuotePage({ searchParams }: { searchParams: Promise<{ kund?: string; manad?: string; fel?: string }> }) {
  await requireBooker();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: cos } = await supabase.from("companies").select("id, name, monthly_hour_divisor, monthly_discount_pct").eq("monthly_billing", true).order("name");
  const companies = (cos ?? []) as { id: string; name: string; monthly_hour_divisor: number; monthly_discount_pct: number }[];
  const co = companies.find((c) => c.id === sp.kund) ?? companies[0];
  const month = /^\d{4}-\d{2}$/.test(sp.manad ?? "") ? sp.manad! : shift(todayDate().slice(0, 7), -1);
  const link = (m: string) => `/offerter/manad?kund=${co?.id ?? ""}&manad=${m}`;

  if (!co) {
    return (
      <div className="grid gap-4 max-w-3xl">
        <h1 className="text-2xl font-semibold">Månadsoffert</h1>
        <p className="text-muted">Ingen kund är inställd för månadsfakturering. Kryssa i <em>Månadsfakturering av lokalhyra</em> på kunden under Kunder.</p>
      </div>
    );
  }

  const from = `${month}-01`;
  const [{ data: rows }, { data: existing }, { data: evq }] = await Promise.all([
    supabase.rpc("monthly_room_lines", { p_company: co.id, p_month: from }),
    supabase.from("monthly_quotes").select("quote_id, quotes(number, status)").eq("company_id", co.id).eq("month", from).maybeSingle(),
    // Kundens egna offerter på evenemang med bokningar i månaden (för tillägg som mat och teknik).
    supabase.from("quote_overview").select("id, number, title, status, total_ex_vat, event_id, event_title").eq("company_id", co.id).neq("status", "avbojd"),
  ]);
  const lines = ((rows ?? []) as Line[]).map((l) => ({ ...l, sum: Math.round(Number(l.hours) * Number(l.hourly) * (1 - Number(l.discount_pct) / 100) * 100) / 100 }));
  const eventIds = new Set(lines.map((l) => l.event_id));
  const extras = ((evq ?? []) as { id: string; number: number; title: string; status: QuoteStatus; total_ex_vat: number; event_id: string | null; event_title: string | null }[])
    .filter((q) => q.event_id && eventIds.has(q.event_id));
  const ex = existing as { quote_id: string | null; quotes: { number: number; status: QuoteStatus } | { number: number; status: QuoteStatus }[] | null } | null;
  const exQuote = ex?.quote_id ? (Array.isArray(ex.quotes) ? ex.quotes[0] : ex.quotes) : null;
  const total = lines.reduce((s, l) => s + l.sum, 0);
  const hours = lines.reduce((s, l) => s + Number(l.hours), 0);
  const rig = lines.reduce((s, l) => s + Number(l.rig_hours), 0);
  const missing = lines.filter((l) => l.day_price == null);
  const capped = lines.filter((l) => l.capped);
  const perRoom = new Map<string, { h: number; sum: number }>();
  for (const l of lines) {
    const r = perRoom.get(l.room_name) ?? { h: 0, sum: 0 };
    perRoom.set(l.room_name, { h: r.h + Number(l.hours), sum: r.sum + l.sum });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href="/offerter" className="text-sm text-muted hover:underline">← Offerter</Link>
        <h1 className="text-2xl font-semibold">Månadsoffert för lokalhyra</h1>
        <p className="text-sm text-muted max-w-3xl">
          All bokad tid under månaden, inklusive bygg och riv. Timpris = lokalens dagshyra delat på {h(co.monthly_hour_divisor)}, högst en dagshyra per bokning och dygn,
          {Number(co.monthly_discount_pct) > 0 ? ` med ${h(co.monthly_discount_pct)} % rabatt` : " utan rabatt"}. Ett utkast skapas automatiskt den 1:a varje månad.
          Granska, lägg till eventuella tillägg och skicka som vanligt. När offerten är godkänd gör ni fakturaunderlaget från månadens evenemang.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {companies.length > 1 && (
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="manad" value={month} />
            <select className="input h-9" name="kund" defaultValue={co.id} aria-label="Kund">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-ghost" type="submit">Visa</button>
          </form>
        )}
        {companies.length === 1 && <span className="font-semibold">{co.name}</span>}
        <span className="flex-1" />
        <Link className="btn btn-ghost px-2" href={link(shift(month, -1))} aria-label="Föregående månad">←</Link>
        <span className="font-semibold w-36 text-center capitalize">{monthName(month)}</span>
        <Link className="btn btn-ghost px-2" href={link(shift(month, 1))} aria-label="Nästa månad">→</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-muted">Bokningar</p><p className="text-xl font-semibold tabular-nums">{lines.length}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Timmar att fakturera</p><p className="text-xl font-semibold tabular-nums">{h(hours)}</p>{rig > 0 && <p className="text-xs text-muted">varav {h(rig)} h bygg/riv</p>}</div>
        <div className="card p-4"><p className="text-xs text-muted">Summa exkl. moms</p><p className="text-xl font-semibold tabular-nums">{fmtKr(total)}</p></div>
        <div className="card p-4">
          <p className="text-xs text-muted">Offert för månaden</p>
          {exQuote ? (
            <p><Link className="font-semibold underline" href={`/offerter/${ex!.quote_id}`}>Nr {exQuote.number}</Link> <span className={`pill q-${exQuote.status} ml-1`}>{QUOTE_STATUS_LABEL[exQuote.status]}</span></p>
          ) : <p className="font-semibold">Inte skapad</p>}
        </div>
      </div>

      {(missing.length > 0 || capped.length > 0) && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn grid gap-1">
          {missing.length > 0 && <p>{missing.length} bokning{missing.length === 1 ? "" : "ar"} i lokaler utan dagshyra i prislistan ({[...new Set(missing.map((l) => l.room_name))].join(", ")}) blir 0 kr. Sätt priset under Inställningar → Prislista, eller justera i offerten.</p>}
          {capped.length > 0 && <p>{capped.length} bokning{capped.length === 1 ? "" : "ar"} är längre än {h(co.monthly_hour_divisor)} h per dygn och har begränsats till en dagshyra per dygn. Kontrollera dem (markerade nedan).</p>}
        </div>
      )}

      <form action={createMonthlyQuote} className="card p-4 grid gap-3">
        <input type="hidden" name="company" value={co.id} />
        <input type="hidden" name="month" value={month} />
        {extras.length > 0 && (
          <fieldset className="grid gap-1">
            <legend className="text-sm font-semibold mb-1">Tillägg från kundens offerter på månadens evenemang (mat, teknik …)</legend>
            {extras.map((q) => (
              <label key={q.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="extra" value={q.id} />
                Nr {q.number} {q.title}{q.event_title ? ` · ${q.event_title}` : ""} · {QUOTE_STATUS_LABEL[q.status]} · {fmtKr(Number(q.total_ex_vat))}
              </label>
            ))}
            <span className="text-xs text-muted">Raderna utom lokalhyran kopieras in. Fakturera dem inte också separat.</span>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {exQuote ? (
            exQuote.status === "utkast" ? (
              <>
                <input type="hidden" name="replace" value="1" />
                <button className="btn" type="submit" disabled={!lines.length}>Gör om utkastet med aktuella bokningar</button>
                <span className="text-sm text-muted">Ändringar du gjort i utkastet ersätts.</span>
              </>
            ) : <span className="text-sm text-muted">Offerten är {QUOTE_STATUS_LABEL[exQuote.status].toLowerCase()} och görs inte om.</span>
          ) : (
            <button className="btn btn-primary" type="submit" disabled={!lines.length}>Skapa offertutkast för {monthName(month)}</button>
          )}
          <span className="text-sm text-muted">Inget skickas till kunden.</span>
        </div>
      </form>

      {perRoom.size > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sunk text-left"><tr><th className="px-3 py-2">Lokal</th><th className="px-3 text-right">Timmar</th><th className="px-3 text-right">Summa</th></tr></thead>
            <tbody>
              {[...perRoom].sort((a, b) => b[1].sum - a[1].sum).map(([r, v]) => (
                <tr key={r} className="border-t border-line"><td className="px-3 py-1.5">{r}</td><td className="px-3 text-right tabular-nums">{h(v.h)}</td><td className="px-3 text-right tabular-nums">{fmtKr(v.sum)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sunk text-left">
            <tr>
              <th className="px-3 py-2">Datum</th><th className="px-2">Tid</th><th className="px-2">Lokal</th><th className="px-2">Evenemang</th>
              <th className="px-2 text-right">Timmar</th><th className="px-2 text-right">Timpris</th><th className="px-2 text-right">Rabatt</th><th className="px-3 text-right">Summa</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.booking_id} className={`border-t border-line ${l.capped || l.day_price == null ? "bg-warn-soft/50" : ""}`}>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(l.starts_at)}</td>
                <td className="px-2 whitespace-nowrap">{fmtTime(l.starts_at)}–{fmtTime(l.ends_at)}</td>
                <td className="px-2">{l.room_name}</td>
                <td className="px-2"><Link className="hover:underline" href={`/evenemang/${l.event_id}`}>{l.event_title}</Link></td>
                <td className="px-2 text-right tabular-nums whitespace-nowrap">{h(l.hours)}{Number(l.rig_hours) > 0 && <span className="text-xs text-muted"> (bygg/riv {h(l.rig_hours)})</span>}{l.capped && <span className="text-xs text-warn"> max/dygn</span>}</td>
                <td className="px-2 text-right tabular-nums">{l.day_price == null ? <span className="text-warn">saknas</span> : fmtKr(Number(l.hourly))}</td>
                <td className="px-2 text-right tabular-nums">{h(l.discount_pct)} %</td>
                <td className="px-3 text-right tabular-nums">{fmtKr(l.sum)}</td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Inga bokningar för {co.name} i {monthName(month)}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

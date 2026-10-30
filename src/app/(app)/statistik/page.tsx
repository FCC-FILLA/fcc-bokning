import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { fmtKr } from "@/lib/offert";
import { MONTHS, delta, pct, summarize, type MoreStats, type Stats } from "@/lib/statistik";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Statistik" };

/** Steg i en enfärgad skala (ljus → mörk) för beläggningen. */
const heat = (p: number) => (p === 0 ? "transparent" : `color-mix(in srgb, var(--color-brand) ${Math.min(90, 12 + p * 0.78)}%, var(--color-surface))`);

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ ar?: string; prel?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear + 2, Math.max(2020, Number(sp.ar) || thisYear));
  const supabase = await createClient();
  const [{ data }, { data: prevData }, { data: moreData }, { data: prevMore }] = await Promise.all([
    supabase.rpc("stats_year", { p_year: year }),
    supabase.rpc("stats_year", { p_year: year - 1 }),
    supabase.rpc("stats_more", { p_year: year }),
    supabase.rpc("stats_more", { p_year: year - 1 }),
  ]);
  const s = data as Stats | null;
  if (!s) return <p className="text-muted">Statistiken gick inte att hämta.</p>;
  const t = summarize(s);
  const p = prevData ? summarize(prevData as Stats) : null;
  const more = moreData as MoreStats | null;
  const pm = prevMore as MoreStats | null;
  const vs = (now: number, before: number | undefined) => {
    const d = before == null ? null : delta(now, before);
    return d == null ? undefined : `${d > 0 ? "+" : ""}${d} % mot ${year - 1}`;
  };
  const withPrel = sp.prel === "1";
  const max = Math.max(1, ...s.quotes.map((q) => Math.max(Number(q.sent_value), Number(q.won_value))));
  const catMax = Math.max(1, ...s.by_category.map((x) => Number(x.value)));
  const tile = (label: string, value: string, sub?: string, change?: string) => (
    <div className="card p-4 grid gap-0.5">
      <span className="label">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {change && <span className={`text-xs font-semibold ${change.startsWith("+") ? "text-ok" : change.startsWith("-") ? "text-warn" : "text-muted"}`}>{change}</span>}
    </div>
  );
  const q = (o: { ar?: number; prel?: boolean }) => `/statistik?ar=${o.ar ?? year}${(o.prel ?? withPrel) ? "&prel=1" : ""}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link className="btn" href={q({ ar: year - 1 })} aria-label="Föregående år">←</Link>
        <h1 className="text-2xl font-semibold">Statistik {year}</h1>
        <Link className="btn" href={q({ ar: year + 1 })} aria-label="Nästa år">→</Link>
        <span className="flex-1" />
        <a className="btn" href={`/statistik/excel?ar=${year}`}>Ladda ner Excel</a>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {tile("Evenemang", String(t.events), `${t.cancelled} avbokade · ${s.participants.toLocaleString("sv-SE")} gäster`, vs(t.events, p?.events))}
        {tile("Bokade timmar", more ? Number(more.booked_hours).toLocaleString("sv-SE") : "–", "bekräftade, alla lokaler", more && pm ? vs(Number(more.booked_hours), Number(pm.booked_hours)) : undefined)}
        {tile("Offererat", fmtKr(t.sentValue), `${t.sent} skickade offerter`, vs(t.sentValue, p?.sentValue))}
        {tile("Vunnet", fmtKr(t.wonValue), `${t.won} accepterade offerter`, vs(t.wonValue, p?.wonValue))}
        {tile("Vinstandel", t.winRate == null ? "–" : `${t.winRate} %`, `${t.won} vunna, ${t.lost} förlorade`, p?.winRate != null && t.winRate != null ? `${t.winRate - p.winRate > 0 ? "+" : ""}${t.winRate - p.winRate} procentenheter` : undefined)}
      </div>

      <section className="card p-5 grid gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">Beläggning per lokal</h2>
          <span className="text-sm text-muted">Andel av månadens dagar med {withPrel ? "bokning (även preliminära)" : "bekräftad bokning"}. En del av en sal räknas som bokad när hela salen är bokad.</span>
          <span className="flex-1" />
          <Link className="text-sm text-muted hover:underline" href={q({ prel: !withPrel })}>{withPrel ? "Bara bekräftade" : "Ta med preliminära"}</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-[2px] text-xs">
            <thead>
              <tr>
                <th className="label text-left font-semibold pr-2">Lokal</th>
                {MONTHS.map((m) => <th key={m} className="label text-center font-semibold">{m}</th>)}
                <th className="label text-right font-semibold pl-2">Timmar</th>
              </tr>
            </thead>
            <tbody>
              {s.occupancy.map((r) => (
                <tr key={r.room_id}>
                  <th scope="row" className={`text-left text-sm pr-2 whitespace-nowrap ${r.parent_id ? "font-normal pl-3" : "font-semibold"}`}>{r.room}</th>
                  {r.months.map((m) => {
                    const p = withPrel ? Math.round((m.days_all / m.days_in_month) * 100) : pct(m);
                    return (
                      <td key={m.m} className="h-8 rounded text-center tabular-nums" style={{ background: heat(p), color: p > 55 ? "white" : "var(--color-fg)" }}
                        title={`${r.room}, ${MONTHS[m.m - 1]} ${year}: ${withPrel ? m.days_all : m.days} av ${m.days_in_month} dagar (${p} %)`}>
                        {p ? `${p}%` : <span className="text-muted">–</span>}
                      </td>
                    );
                  })}
                  <td className="text-right tabular-nums pl-2">{Math.round(r.months.reduce((x, m) => x + Number(m.hours), 0)).toLocaleString("sv-SE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 grid gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <h2 className="text-lg font-semibold">Offererat och vunnet per månad</h2>
          <span className="flex items-center gap-1.5 text-sm"><span className="inline-block size-3 rounded-sm bg-line" /> Offererat (skickade)</span>
          <span className="flex items-center gap-1.5 text-sm"><span className="inline-block size-3 rounded-sm bg-brand" /> Vunnet (accepterade)</span>
          <span className="text-sm text-muted">Exkl. moms</span>
        </div>
        <div className="grid grid-cols-12 items-end gap-2 h-48 border-b border-line">
          {s.quotes.map((m) => (
            <div key={m.m} className="flex h-full items-end justify-center gap-[2px]"
              title={`${MONTHS[m.m - 1]}: offererat ${fmtKr(Number(m.sent_value))} (${m.sent} st), vunnet ${fmtKr(Number(m.won_value))} (${m.won} st), förlorat ${m.lost} st`}>
              <span className="w-1/3 max-w-4 rounded-t bg-line" style={{ height: `${(Number(m.sent_value) / max) * 100}%` }} />
              <span className="w-1/3 max-w-4 rounded-t bg-brand" style={{ height: `${(Number(m.won_value) / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-2 text-center text-xs text-muted">{MONTHS.map((m) => <span key={m}>{m}</span>)}</div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Visa som tabell</summary>
          <table className="table mt-2">
            <thead><tr><th className="pl-0">Månad</th><th className="text-right">Skickade</th><th className="text-right">Offererat</th><th className="text-right">Vunna</th><th className="text-right">Vunnet</th><th className="text-right">Förlorade</th></tr></thead>
            <tbody>
              {s.quotes.map((m) => (
                <tr key={m.m}><td className="pl-0">{MONTHS[m.m - 1]}</td><td className="text-right">{m.sent}</td><td className="text-right">{fmtKr(Number(m.sent_value))}</td><td className="text-right">{m.won}</td><td className="text-right">{fmtKr(Number(m.won_value))}</td><td className="text-right">{m.lost}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Vunnet per kundkategori</h2>
          {s.by_category.length === 0 ? <p className="text-sm text-muted">Inga accepterade offerter {year}.</p> : (
            <ul className="grid gap-2">
              {s.by_category.map((x) => (
                <li key={x.category} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm" title={`${x.category}: ${x.count} offerter, ${fmtKr(Number(x.value))}`}>
                  <span className="truncate">{x.category}</span>
                  <span className="h-3 rounded-r bg-brand" style={{ width: `${Math.max(2, (Number(x.value) / catMax) * 100)}%` }} />
                  <span className="tabular-nums text-right">{fmtKr(Number(x.value))} <span className="text-muted">({x.count})</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">En kund i flera kategorier räknas i varje.</p>
        </section>
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Per evenemangstyp</h2>
          {s.by_type.length === 0 ? <p className="text-sm text-muted">Inga accepterade offerter {year}.</p> : (
            <table className="table text-sm">
              <thead><tr><th className="pl-0">Typ</th><th className="text-right">Evenemang</th><th className="text-right">Vunnet</th><th className="text-right">Snitt</th></tr></thead>
              <tbody>
                {s.by_type.map((x) => (
                  <tr key={x.type}>
                    <td className="pl-0"><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: x.color ?? "var(--color-line)" }} />{x.type}</td>
                    <td className="text-right tabular-nums">{x.events}</td>
                    <td className="text-right tabular-nums">{fmtKr(Number(x.value))}</td>
                    <td className="text-right tabular-nums">{fmtKr(Number(x.avg))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      {more && <More more={more} year={year} />}
    </div>
  );
}

const DOW = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];

function Bars({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${fmt(r.value)}${r.sub ? ` (${r.sub})` : ""}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-3 rounded-r bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          <span className="tabular-nums text-right">{fmt(r.value)}{r.sub && <span className="text-muted"> {r.sub}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

function More({ more, year }: { more: MoreStats; year: number }) {
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 06–23
  const cell = new Map(more.week.map((w) => [`${w.dow}-${w.hour}`, Number(w.hours)]));
  const wmax = Math.max(1, ...more.week.map((w) => Number(w.hours)));
  const perDow = [1, 2, 3, 4, 5, 6, 7].map((d) => more.week.filter((w) => w.dow === d).reduce((s, w) => s + Number(w.hours), 0));
  const inq = MONTHS.map((_, i) => more.inquiries.find((x) => x.m === i + 1) ?? { m: i + 1, count: 0, won: 0 });
  const inqTotal = inq.reduce((s, x) => s + x.count, 0);
  const inqWon = inq.reduce((s, x) => s + x.won, 0);
  const staff = MONTHS.map((_, i) => more.staff.find((x) => x.m === i + 1) ?? { m: i + 1, hours: 0, shifts: 0 });
  const staffMax = Math.max(1, ...staff.map((x) => Number(x.hours)));
  const h = (n: number) => Math.round(n).toLocaleString("sv-SE");
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Största kunderna</h2>
          {more.top_customers.length === 0 ? <p className="text-sm text-muted">Inga kunder med bokningar eller vunna offerter {year}.</p> : (
            <table className="table text-sm">
              <thead><tr><th className="pl-0">Kund</th><th className="text-right">Vunnet</th><th className="text-right">Timmar</th><th className="text-right">Evenemang</th></tr></thead>
              <tbody>
                {more.top_customers.map((c) => (
                  <tr key={c.id}>
                    <td className="pl-0"><Link className="hover:underline" href={`/kunder/${c.id}`}>{c.name}</Link></td>
                    <td className="text-right tabular-nums">{Number(c.value) ? fmtKr(Number(c.value)) : <span className="text-muted">–</span>}</td>
                    <td className="text-right tabular-nums">{h(Number(c.hours))}</td>
                    <td className="text-right tabular-nums">{c.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted">Vunnet = accepterade offerter under året. Timmar = bekräftad bokad tid.</p>
        </section>
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Lokalhyra per lokal</h2>
          {more.room_revenue.length === 0 ? <p className="text-sm text-muted">Inga accepterade lokalrader {year}.</p> : (
            <Bars rows={more.room_revenue.map((r) => ({ label: r.room, value: Number(r.value) }))} fmt={(n) => fmtKr(n)} />
          )}
          <p className="text-xs text-muted">Rader i accepterade offerter som hör till en lokal i prislistan, efter rabatt, exkl. moms.</p>
        </section>
      </div>

      <section className="card p-5 grid gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">När huset används</h2>
          <span className="text-sm text-muted">Bokade lokaltimmar per veckodag och klockslag. Mörkare = fler lokaler bokade samtidigt.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[2px] text-[10px]">
            <thead>
              <tr><th />{hours.map((x) => <th key={x} className="w-7 text-center font-normal text-muted">{String(x).padStart(2, "0")}</th>)}<th className="pl-2 text-right font-normal text-muted">timmar</th></tr>
            </thead>
            <tbody>
              {DOW.map((d, i) => (
                <tr key={d}>
                  <th scope="row" className="pr-2 text-left text-xs font-semibold">{d}</th>
                  {hours.map((x) => {
                    const v = cell.get(`${i + 1}-${x}`) ?? 0;
                    const p = Math.round((v / wmax) * 100);
                    return <td key={x} className="h-6 w-7 rounded" style={{ background: heat(p) }} title={`${d} ${String(x).padStart(2, "0")}:00: ${h(v)} lokaltimmar`} />;
                  })}
                  <td className="pl-2 text-right text-xs tabular-nums">{h(perDow[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3 items-start">
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Framförhållning</h2>
          {more.lead.length === 0 ? <p className="text-sm text-muted">Inga bekräftade evenemang {year}.</p> : (
            <Bars rows={more.lead.map((x) => ({ label: x.bucket, value: x.events }))} fmt={(n) => `${n} st`} />
          )}
          <p className="text-xs text-muted">Tid från att evenemanget lades in till första bokningen.</p>
        </section>
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Förfrågningar från hemsidan</h2>
          {inqTotal === 0 ? <p className="text-sm text-muted">Inga förfrågningar {year}.</p> : (
            <>
              <p className="text-sm">{inqTotal} förfrågningar, {inqWon} blev bekräftade ({Math.round((inqWon / inqTotal) * 100)} %).</p>
              <Bars rows={inq.filter((x) => x.count).map((x) => ({ label: MONTHS[x.m - 1], value: x.count, sub: x.won ? `(${x.won} bokade)` : undefined }))} fmt={(n) => `${n}`} />
            </>
          )}
        </section>
        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Personaltimmar</h2>
          {staff.every((x) => !Number(x.hours)) ? <p className="text-sm text-muted">Inga tillsatta pass {year}.</p> : (
            <>
              <div className="grid grid-cols-12 items-end gap-1 h-28 border-b border-line">
                {staff.map((x) => (
                  <span key={x.m} className="rounded-t bg-brand" style={{ height: `${(Number(x.hours) / staffMax) * 100}%` }} title={`${MONTHS[x.m - 1]}: ${h(Number(x.hours))} timmar, ${x.shifts} pass`} />
                ))}
              </div>
              <div className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted">{MONTHS.map((m) => <span key={m}>{m}</span>)}</div>
              <p className="text-sm">{h(staff.reduce((s, x) => s + Number(x.hours), 0))} timmar totalt på tillsatta pass.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { fmtKr } from "@/lib/offert";
import { MONTHS, pct, summarize, type Stats } from "@/lib/statistik";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Statistik" };

/** Steg i en enfärgad skala (ljus → mörk) för beläggningen. */
const heat = (p: number) => (p === 0 ? "transparent" : `color-mix(in srgb, var(--color-brand) ${Math.min(90, 12 + p * 0.78)}%, var(--color-surface))`);

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ ar?: string; prel?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const thisYear = new Date().getFullYear();
  const year = Math.min(thisYear + 2, Math.max(2020, Number(sp.ar) || thisYear));
  const { data } = await (await createClient()).rpc("stats_year", { p_year: year });
  const s = data as Stats | null;
  if (!s) return <p className="text-muted">Statistiken gick inte att hämta.</p>;
  const t = summarize(s);
  const withPrel = sp.prel === "1";
  const max = Math.max(1, ...s.quotes.map((q) => Math.max(Number(q.sent_value), Number(q.won_value))));
  const catMax = Math.max(1, ...s.by_category.map((x) => Number(x.value)));
  const tile = (label: string, value: string, sub?: string) => (
    <div className="card p-4 grid gap-0.5">
      <span className="label">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
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

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tile("Evenemang", String(t.events), `${t.cancelled} avbokade · ${s.participants.toLocaleString("sv-SE")} gäster`)}
        {tile("Offererat", fmtKr(t.sentValue), `${t.sent} skickade offerter`)}
        {tile("Vunnet", fmtKr(t.wonValue), `${t.won} accepterade offerter`)}
        {tile("Vinstandel", t.winRate == null ? "–" : `${t.winRate} %`, `${t.won} vunna, ${t.lost} förlorade`)}
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
    </div>
  );
}

import Link from "next/link";
import { SortTh, parseSort, sortRows } from "@/components/sort-th";
import { canBook, getProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { QUOTE_STATUS_LABEL, fmtKr, type QuoteStatus } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import type { QuoteOverview } from "@/lib/types";

export const metadata = { title: "Offerter" };

const STATUSES = Object.keys(QUOTE_STATUS_LABEL) as QuoteStatus[];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; sort?: string; ordning?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as QuoteStatus) ? (sp.status as QuoteStatus) : "";
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "");
  const supabase = await createClient();
  const profile = await getProfile();

  let query = supabase.from("quote_overview").select("*").order("number", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`title.ilike.%${q}%,company_name.ilike.%${q}%`);
  const { data } = await query;
  const sort = parseSort(sp, ["nr", "offert", "kund", "varde", "giltig", "status"], { col: "nr", asc: false });
  const quotes = sortRows((data ?? []) as QuoteOverview[], sort, {
    nr: (x) => x.number,
    offert: (x) => x.title,
    kund: (x) => x.company_name,
    varde: (x) => Number(x.total_ex_vat),
    giltig: (x) => x.valid_until,
    status: (x) => x.status,
  });
  const href = (extra: string) => `/offerter?${[status && `status=${status}`, q && `q=${encodeURIComponent(q)}`, extra].filter(Boolean).join("&")}`;

  const { data: all } = await supabase.from("quote_overview").select("status, total_ex_vat");
  const sums = STATUSES.map((s) => {
    const rows = ((all ?? []) as { status: QuoteStatus; total_ex_vat: number }[]).filter((r) => r.status === s);
    return { s, n: rows.length, sum: rows.reduce((t, r) => t + Number(r.total_ex_vat), 0) };
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Offerter</h1>
        <span className="flex-1" />
        {canBook(profile) && <Link className="btn btn-primary" href="/offerter/ny">Ny offert</Link>}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {sums.map((x) => (
          <Link key={x.s} href={`/offerter?status=${x.s}`} className={`card p-4 grid gap-1 hover:border-muted ${status === x.s ? "ring-2 ring-brand" : ""}`}>
            <span className={`pill q-${x.s} justify-self-start`}>{QUOTE_STATUS_LABEL[x.s]}</span>
            <span className="font-display text-xl font-semibold tabular-nums">{fmtKr(x.sum)}</span>
            <span className="text-xs text-muted">{x.n} offert{x.n === 1 ? "" : "er"}, exkl. moms</span>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="field w-64 max-w-full">
          <label className="label" htmlFor="q">Sök</label>
          <input className="input" id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Rubrik eller kund" />
        </div>
        <div className="field">
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={status}>
            <option value="">Alla</option>
            {STATUSES.map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <button className="btn" type="submit">Filtrera</button>
      </form>

      {quotes.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Inga offerter här än. Skapa en från ett evenemang eller med <Link className="underline" href="/offerter/ny">Ny offert</Link>.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[820px]">
            <thead>
              <tr>
                <SortTh col="nr" label="Nr" sort={sort} href={href} />
                <SortTh col="offert" label="Offert" sort={sort} href={href} />
                <SortTh col="kund" label="Kund" sort={sort} href={href} />
                <SortTh col="varde" label="Värde exkl. moms" sort={sort} href={href} className="text-right" />
                <SortTh col="giltig" label="Giltig till" sort={sort} href={href} />
                <SortTh col="status" label="Status" sort={sort} href={href} />
              </tr>
            </thead>
            <tbody>
              {quotes.map((x) => (
                <tr key={x.id} className="hover:bg-sunk/60">
                  <td className="font-mono text-sm">{x.number}</td>
                  <td>
                    <Link className="font-semibold hover:underline underline-offset-2" href={`/offerter/${x.id}`}>{x.title}</Link>
                    {x.event_title && <span className="block text-xs text-muted">{x.event_title}</span>}
                  </td>
                  <td>{x.company_name ?? <span className="text-muted">–</span>}</td>
                  <td className="text-right">{fmtKr(Number(x.total_ex_vat))}</td>
                  <td className="text-sm">{x.valid_until ? fmtDate(x.valid_until) : "–"}</td>
                  <td><span className={`pill q-${x.status}`}>{QUOTE_STATUS_LABEL[x.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

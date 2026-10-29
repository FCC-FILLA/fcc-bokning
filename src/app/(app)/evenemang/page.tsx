import { loadOptionPlaces, optionOrdinal } from "@/lib/bokning";
import Link from "next/link";
import { SortTh, parseSort, sortRows } from "@/components/sort-th";
import { canBook, getProfile } from "@/lib/auth";
import { fmtRange } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, STATUS_LABEL, type EventOverview } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

export const metadata = { title: "Evenemang" };

const PERIODS = { kommande: "Kommande", tidigare: "Tidigare", alla: "Alla" } as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; period?: string; sort?: string; ordning?: string }>;
}) {
  const sp = await searchParams;
  const period = (sp.period && sp.period in PERIODS ? sp.period : "kommande") as keyof typeof PERIODS;
  const status = STATUSES.includes(sp.status as never) ? sp.status : "";
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();
  const profile = await getProfile();
  const now = new Date().toISOString();

  let query = supabase.from("event_overview").select("*");
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, "")}%,company_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  if (period === "kommande") query = query.or(`ends_at.gte.${now},ends_at.is.null`).order("starts_at", { ascending: true, nullsFirst: true });
  else if (period === "tidigare") query = query.lt("ends_at", now).order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });

  const { data } = await query.limit(300);
  const sort = parseSort(sp, ["namn", "kund", "tid", "bokningar", "status"], { col: "tid", asc: period !== "tidigare" });
  const events = sortRows((data ?? []) as EventOverview[], sort, {
    namn: (e) => e.title,
    kund: (e) => e.company_name,
    tid: (e) => e.starts_at,
    bokningar: (e) => e.booking_count,
    status: (e) => ["forfragan", "preliminar", "bekraftad", "genomford", "avbokad"].indexOf(e.status),
  });
  const href = (extra: string) => `/evenemang?${[status && `status=${status}`, q && `q=${encodeURIComponent(q)}`, `period=${period}`, extra].filter(Boolean).join("&")}`;
  const optionPlace = await loadOptionPlaces(supabase, events.filter((e) => e.status === "forfragan" || e.status === "preliminar").map((e) => e.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Evenemang</h1>
        <span className="flex-1" />
        {canBook(profile) && <Link className="btn btn-primary" href="/evenemang/ny">Nytt evenemang</Link>}
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="field w-64 max-w-full">
          <label className="label" htmlFor="q">Sök</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="Evenemang eller kund" />
        </div>
        <div className="field">
          <label className="label" htmlFor="status-filter">Status</label>
          <select className="input" id="status-filter" name="status" defaultValue={status}>
            <option value="">Alla</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="period">Period</label>
          <select className="input" id="period" name="period" defaultValue={period}>
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="btn" type="submit">Filtrera</button>
      </form>

      {events.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Inga evenemang matchar. {canBook(profile) && <Link className="underline underline-offset-2" href="/evenemang/ny">Skapa ett nytt evenemang.</Link>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <SortTh col="namn" label="Evenemang" sort={sort} href={href} />
                <SortTh col="kund" label="Kund" sort={sort} href={href} />
                <SortTh col="tid" label="Tid" sort={sort} href={href} />
                <SortTh col="bokningar" label="Bokningar" sort={sort} href={href} />
                <SortTh col="status" label="Status" sort={sort} href={href} />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-sunk/60">
                  <td>
                    <Link className="font-semibold hover:underline underline-offset-2" href={`/evenemang/${e.id}`}>{e.title}</Link>
                    {e.event_type_name && <span className="block text-xs text-muted">{e.event_type_name}</span>}
                  </td>
                  <td>{e.company_name ?? <span className="text-muted">–</span>}</td>
                  <td className="whitespace-nowrap text-sm">
                    {e.starts_at && e.ends_at ? fmtRange(e.starts_at, e.ends_at) : <span className="text-muted">Inga tider än</span>}
                  </td>
                  <td>{e.booking_count}</td>
                  <td className="whitespace-nowrap">
                    <StatusPill status={e.status} />
                    {optionPlace.has(e.id) && <span className="ml-2 text-xs font-semibold text-st-preliminar">{optionOrdinal(optionPlace.get(e.id)!)} option</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { loadCompany } from "@/lib/foretag";
import { shiftHours } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mina pass", robots: { index: false, follow: false } };

type LinkShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  function: string;
  color: string;
  title: string | null;
  note: string | null;
  event: string | null;
  room: string | null;
  needed: number;
  status: string;
};

/** Personlig sida för frilansare och leverantörer, utan inloggning. */
export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const supabase = await createClient();
  const [{ data }, company] = await Promise.all([supabase.rpc("link_shifts", { p_token: token }), loadCompany(supabase)]);
  if (!data) notFound();
  const doc = data as { name: string; company: string | null; kind: "frilans" | "leverantor"; shifts: LinkShift[] };
  const now = new Date().toISOString();
  const upcoming = doc.shifts.filter((s) => s.ends_at >= now);
  const past = doc.shifts.filter((s) => s.ends_at < now).reverse();
  const supplier = doc.kind === "leverantor";

  const group = (list: LinkShift[]) => {
    const m = new Map<string, LinkShift[]>();
    for (const s of list) m.set(isoToDate(s.starts_at), [...(m.get(isoToDate(s.starts_at)) ?? []), s]);
    return [...m];
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-brand text-white">
        <div className="mx-auto max-w-2xl px-4 py-5 grid gap-2">
          <p className="font-display font-semibold tracking-wide text-sm uppercase">{company.name}</p>
          <h1 className="font-display text-2xl font-semibold">{supplier && doc.company ? doc.company : doc.name}</h1>
          <p className="text-sm opacity-85">{upcoming.length
              ? `${upcoming.length} kommande ${supplier ? (upcoming.length === 1 ? "bokning" : "bokningar") : "pass"}`
              : `Inga kommande ${supplier ? "bokningar" : "pass"}`}</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5 grid gap-5">
        {group(upcoming).map(([date, list]) => (
          <section key={date} className="grid gap-2">
            <h2 className="font-display font-semibold">{fmtDate(date)}</h2>
            {list.map((s) => (
              <article key={s.id} className="card p-4 grid gap-1 border-l-4" style={{ borderLeftColor: s.color }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{s.function}{s.title ? ` · ${s.title}` : ""}{supplier && s.needed > 1 ? ` · ${s.needed} personer` : ""}</p>
                  <p className="tabular-nums font-medium">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)} <span className="text-sm text-muted">({shiftHours(s).toLocaleString("sv-SE")} h)</span></p>
                </div>
                {(s.event || s.room) && <p className="text-sm text-muted">{[s.event, s.room].filter(Boolean).join(" · ")}</p>}
                {s.note && <p className="text-sm">{s.note}</p>}
                {s.status === "inbjuden" && <p className="text-sm text-st-preliminar font-medium">Inbjudan väntar på svar.</p>}
              </article>
            ))}
          </section>
        ))}
        {past.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer font-medium">Tidigare ({past.length})</summary>
            <ul className="mt-3 grid gap-1 text-sm">
              {past.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular-nums w-44">{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                  <span>{s.function}</span>
                  <span className="text-muted">{s.event}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-xs text-muted">Den här sidan är personlig. Dela inte länken.</p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { fmtRange } from "@/lib/datum";
import { getLookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import type { EventOverview } from "@/lib/types";
import { createQuote } from "../actions";

export const metadata = { title: "Ny offert" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ evenemang?: string; fel?: string }> }) {
  const profile = await requireProfile();
  if (!canBook(profile)) redirect("/offerter");
  const sp = await searchParams;
  const supabase = await createClient();
  const lookups = await getLookups();
  const { data } = await supabase
    .from("event_overview")
    .select("*")
    .in("status", ["forfragan", "preliminar", "bekraftad"])
    .order("starts_at", { ascending: true, nullsFirst: true })
    .limit(300);
  const events = (data ?? []) as EventOverview[];
  const selected = events.find((e) => e.id === sp.evenemang);

  return (
    <form action={createQuote} className="grid gap-5 max-w-3xl">
      <div className="grid gap-2">
        <Link href="/offerter" className="text-sm text-muted hover:underline">← Offerter</Link>
        <h1 className="text-2xl font-semibold">Ny offert</h1>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <section className="card p-5 grid gap-4">
        <div className="field">
          <label className="label" htmlFor="event_id">Evenemang</label>
          <select className="input" id="event_id" name="event_id" defaultValue={selected?.id ?? ""}>
            <option value="">Inget evenemang</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.company_name ? ` · ${e.company_name}` : ""}
                {e.starts_at && e.ends_at ? ` · ${fmtRange(e.starts_at, e.ends_at)}` : ""}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">Kund och kontakt hämtas från evenemanget.</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="from_bookings" defaultChecked />
          Lägg in evenemangets bokade lokaler som rader, med pris från prislistan
        </label>
        <div className="field">
          <label className="label" htmlFor="title">Rubrik</label>
          <input className="input" id="title" name="title" required defaultValue={selected?.title ?? ""} placeholder="T.ex. Årskonferens 2027" />
        </div>
        <div className="field">
          <label className="label" htmlFor="company_id">Kund (om inget evenemang är valt)</label>
          <select className="input" id="company_id" name="company_id" defaultValue="">
            <option value="">Välj kund</option>
            {lookups.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </section>
      <div className="flex gap-3">
        <button className="btn btn-primary" type="submit">Skapa offert</button>
        <Link className="btn" href="/offerter">Avbryt</Link>
      </div>
    </form>
  );
}

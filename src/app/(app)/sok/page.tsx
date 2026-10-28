import Link from "next/link";
import { fmtDate, fmtRange } from "@/lib/datum";
import { QUOTE_STATUS_LABEL, fmtKr } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import type { Company, Contact, EventOverview, QuoteOverview } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

export const metadata = { title: "Sök" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw = "" } = await searchParams;
  const q = raw.trim().slice(0, 100);
  const safe = q.replace(/[%,()*\\"]/g, " ").trim();
  // Citattecken runt värdet så att mellanslag och punkter fungerar i PostgREST-filtret.
  const like = `"%${safe}%"`;
  const num = /^\d{3,6}$/.test(safe) ? Number(safe) : null;

  const supabase = await createClient();
  const [ev, co, ct, qu] = safe
    ? await Promise.all([
        supabase.from("event_overview").select("*").or(`title.ilike.${like},company_name.ilike.${like}`).order("starts_at", { ascending: false }).limit(25),
        supabase.from("companies").select("*").or(`name.ilike.${like},org_nr.ilike.${like},email.ilike.${like}`).order("name").limit(15),
        supabase.from("contacts").select("*, companies(name)").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).order("name").limit(15),
        num
          ? supabase.from("quote_overview").select("*").eq("number", num).limit(5)
          : supabase.from("quote_overview").select("*").or(`title.ilike.${like},company_name.ilike.${like}`).order("number", { ascending: false }).limit(15),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const events = (ev.data ?? []) as EventOverview[];
  const companies = (co.data ?? []) as Company[];
  const contacts = (ct.data ?? []) as (Contact & { companies: { name: string } | null })[];
  const quotes = (qu.data ?? []) as QuoteOverview[];
  const total = events.length + companies.length + contacts.length + quotes.length;

  return (
    <div className="grid gap-5 max-w-4xl">
      <form method="get" className="flex gap-2" role="search">
        <input className="input text-lg" name="q" type="search" defaultValue={q} autoFocus placeholder="Sök evenemang, kunder, kontakter eller offertnummer" aria-label="Sök" />
        <button className="btn btn-primary" type="submit">Sök</button>
      </form>
      {safe && <p className="text-sm text-muted">{total ? `${total} träffar för "${q}"` : `Inga träffar för "${q}".`}</p>}

      {events.length > 0 && (
        <Section title="Evenemang">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link className="font-semibold hover:underline" href={`/evenemang/${e.id}`}>{e.title}</Link>
              <StatusPill status={e.status} />
              <span className="text-sm text-muted">
                {e.company_name ?? ""}{e.starts_at && e.ends_at ? ` · ${fmtRange(e.starts_at, e.ends_at)}` : ""}
              </span>
            </li>
          ))}
        </Section>
      )}
      {quotes.length > 0 && (
        <Section title="Offerter">
          {quotes.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link className="font-semibold hover:underline" href={`/offerter/${x.id}`}>#{x.number} {x.title}</Link>
              <span className={`pill q-${x.status}`}>{QUOTE_STATUS_LABEL[x.status]}</span>
              <span className="text-sm text-muted">{x.company_name ?? ""} · {fmtKr(Number(x.total_ex_vat))} · {fmtDate(x.created_at)}</span>
            </li>
          ))}
        </Section>
      )}
      {companies.length > 0 && (
        <Section title="Kunder">
          {companies.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3">
              <Link className="font-semibold hover:underline" href={`/kunder/${c.id}`}>{c.name}</Link>
              <span className="text-sm text-muted">{[c.org_nr, c.email].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </Section>
      )}
      {contacts.length > 0 && (
        <Section title="Kontaktpersoner">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3">
              {c.company_id ? (
                <Link className="font-semibold hover:underline" href={`/kunder/${c.company_id}#kontakter`}>{c.name}</Link>
              ) : (
                <span className="font-semibold">{c.name}</span>
              )}
              <span className="text-sm text-muted">{[c.companies?.name, c.email, c.phone].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="grid gap-2">{children}</ul>
    </section>
  );
}

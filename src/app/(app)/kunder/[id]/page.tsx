import Link from "next/link";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { fmtRange } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import type { Company, Contact, EventOverview } from "@/lib/types";
import { CompanyFields } from "@/components/company-fields";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusPill } from "@/components/status-pill";
import { addContact, deleteCompany, deleteContact, updateCompany } from "../actions";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const booker = canBook(profile);
  const supabase = await createClient();

  const [{ data: company }, { data: contactData }, { data: eventData }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase.from("contacts").select("*").eq("company_id", id).order("name"),
    supabase.from("event_overview").select("*").eq("company_id", id).order("starts_at", { ascending: false }).limit(100),
  ]);
  if (!company) notFound();
  const c = company as Company;
  const contacts = (contactData ?? []) as Contact[];
  const events = (eventData ?? []) as EventOverview[];

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-2">
        <Link href="/kunder" className="text-sm text-muted hover:underline">← Kunder</Link>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Kunden är sparad.</p>}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <form action={updateCompany.bind(null, id)} className="card p-5 grid gap-4">
          <h2 className="text-lg font-semibold">Uppgifter</h2>
          <CompanyFields company={c} disabled={!booker} />
          {booker && <div><button className="btn btn-primary" type="submit">Spara ändringar</button></div>}
        </form>

        <section id="kontakter" className="card p-5 grid gap-4 scroll-mt-20">
          <h2 className="text-lg font-semibold">Kontaktpersoner</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted">Inga kontaktpersoner ännu.</p>
          ) : (
            <ul className="grid gap-2">
              {contacts.map((ct) => (
                <li key={ct.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{ct.name}{ct.title && <span className="font-normal text-muted">, {ct.title}</span>}</p>
                    <p className="text-sm text-muted break-words">{[ct.email, ct.phone].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}</p>
                  </div>
                  {booker && (
                    <form action={deleteContact.bind(null, id, ct.id)}>
                      <ConfirmButton label="Ta bort" question="Ta bort kontakten?" confirmLabel="Ta bort" className="btn btn-ghost text-sm text-warn" />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {booker && (
            <form action={addContact.bind(null, id)} className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
              <div className="field"><label className="label" htmlFor="contact_name">Namn</label><input className="input" id="contact_name" name="contact_name" required /></div>
              <div className="field"><label className="label" htmlFor="contact_title">Roll</label><input className="input" id="contact_title" name="contact_title" /></div>
              <div className="field"><label className="label" htmlFor="contact_email">E-post</label><input className="input" id="contact_email" name="contact_email" type="email" /></div>
              <div className="field"><label className="label" htmlFor="contact_phone">Telefon</label><input className="input" id="contact_phone" name="contact_phone" type="tel" /></div>
              <div><button className="btn" type="submit">Lägg till kontakt</button></div>
            </form>
          )}
        </section>
      </div>

      <section className="card p-5 grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Evenemang</h2>
          <span className="flex-1" />
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Inga evenemang för den här kunden.</p>
        ) : (
          <ul className="grid gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3">
                <Link className="font-semibold hover:underline underline-offset-2" href={`/evenemang/${e.id}`}>{e.title}</Link>
                <span className="text-sm text-muted">{e.starts_at && e.ends_at ? fmtRange(e.starts_at, e.ends_at) : "Inga tider"}</span>
                <StatusPill status={e.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {booker && (
        <form action={deleteCompany.bind(null, id)} className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>Evenemang kopplade till kunden finns kvar men tappar kopplingen.</span>
          <ConfirmButton label="Ta bort kunden" question="Kunden och dess kontaktpersoner tas bort." confirmLabel="Ta bort" />
        </form>
      )}
    </div>
  );
}

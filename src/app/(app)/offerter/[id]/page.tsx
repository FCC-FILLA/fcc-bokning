import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { getLookups } from "@/lib/lookups";
import { QuoteRooms } from "@/components/quote-rooms";
import { QUOTE_STATUS_LABEL } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import type { Article, ArticleGroup, Quote, QuoteLine } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { History } from "@/components/history";
import { QuoteEditor } from "@/components/quote-editor";
import {
  addBookingLines, backToDraft, confirmEvent, deleteQuote, duplicateQuote, markSent, registerAnswer, saveLines, updateQuote,
} from "../actions";

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; skickad?: string; kopierad?: string; bekraftad?: string; sprak?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const booker = canBook(profile);
  const supabase = await createClient();

  const [{ data: q }, { data: lineData }, { data: groupData }, { data: articleData }, lookups, { data: eventData }] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    supabase.from("article_groups").select("*").order("sort_order"),
    supabase.from("articles").select("id, article_no, name, group_id, unit, price, cost, vat_rate").eq("active", true).order("sort_order"),
    getLookups(),
    supabase.from("events").select("id, title, status").in("status", ["forfragan", "preliminar", "bekraftad"]).order("created_at", { ascending: false }).limit(300),
  ]);
  if (!q) notFound();
  const quote = q as Quote;
  const lines = (lineData ?? []) as QuoteLine[];
  const groups = (groupData ?? []) as ArticleGroup[];
  const articles = (articleData ?? []) as Article[];
  const events = (eventData ?? []) as { id: string; title: string; status: string }[];
  const linkedEvent = quote.event_id ? (await supabase.from("events").select("id, title, status").eq("id", quote.event_id).maybeSingle()).data : null;
  if (linkedEvent && !events.some((e) => e.id === linkedEvent.id)) events.unshift(linkedEvent);

  const customer = quote.company_id ? lookups.companies.find((c) => c.id === quote.company_id) : undefined;
  const commission = customer?.commission_pct ? Number(customer.commission_pct) : null;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const shareUrl = `${origin}/offert/${quote.share_token}`;
  const locked = quote.status === "accepterad" || !booker;
  const expired = quote.valid_until != null && quote.valid_until < new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-2">
        <Link href="/offerter" className="text-sm text-muted hover:underline">← Offerter</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            <span className="text-muted font-normal">#{quote.number}</span> {quote.title}
          </h1>
          <span className={`pill q-${quote.status}`}>{QUOTE_STATUS_LABEL[quote.status]}</span>
          {linkedEvent && (
            <Link className="text-sm text-muted hover:underline" href={`/evenemang/${linkedEvent.id}`}>
              Evenemang: {linkedEvent.title}
            </Link>
          )}
          <span className="flex-1" />
          <a className="btn" href={`/offerter/${id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
        </div>
      </div>

      {commission && customer && (
        <div className="rounded-lg border border-st-preliminar bg-st-preliminar-soft px-4 py-3 text-sm text-st-preliminar grid gap-0.5">
          <strong>Observera: {customer.name} har {commission.toLocaleString("sv-SE")} % provision{customer.commission_to ? ` till ${customer.commission_to}` : ""}.</strong>
          {customer.commission_note && <span>{customer.commission_note}</span>}
          <span>Ta höjd för provisionen i priset. Den syns inte för kunden.</span>
        </div>
      )}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sprak && <Ok>Språket är bytt. Inledning och villkor har bytts till standardtexterna på det nya språket.</Ok>}
      {sp.sparat && <Ok>{sp.sparat === "rader" ? "Raderna är sparade." : "Offerten är sparad."}</Ok>}
      {sp.kopierad && <Ok>Kopian är skapad som utkast.</Ok>}
      {sp.bekraftad && <Ok>Evenemanget är nu Bekräftat.</Ok>}

      {/* Status och utskick */}
      <section className="card p-5 grid gap-3 border-l-4 border-l-brand">
        {quote.status === "utkast" && (
          <>
            <p>
              Offerten är ett <strong>utkast</strong> och syns inte för kunden. När den är klar markerar du den som skickad. Då
              blir kundlänken aktiv, och kunden kan läsa, ladda ner och godkänna offerten.
            </p>
            {booker && (
              <form action={markSent.bind(null, id)}>
                <button className="btn btn-primary" type="submit">Markera som skickad och aktivera kundlänken</button>
              </form>
            )}
          </>
        )}
        {quote.status === "skickad" && (
          <>
            <p>
              Skickad {quote.sent_at ? fmtDate(quote.sent_at) : ""}. Skicka länken till kunden i ett mejl. Där kan kunden
              godkänna eller avböja.{expired && <strong className="text-warn"> Giltighetstiden har gått ut, så kunden kan inte godkänna förrän du förlänger den.</strong>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-sunk px-2 py-1.5 text-sm break-all">{shareUrl}</code>
              <CopyButton text={shareUrl} />
              <a className="btn" href={shareUrl} target="_blank" rel="noreferrer">Visa som kund</a>
            </div>
            {booker && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Svarade kunden på annat sätt?</span>
                <form action={registerAnswer.bind(null, id, true)}><button className="btn" type="submit">Registrera som accepterad</button></form>
                <form action={registerAnswer.bind(null, id, false)}><button className="btn" type="submit">Registrera som avböjd</button></form>
                <form action={backToDraft.bind(null, id)}><button className="btn btn-ghost" type="submit">Tillbaka till utkast</button></form>
              </div>
            )}
          </>
        )}
        {quote.status === "accepterad" && (
          <>
            <p>
              <strong className="text-ok">Accepterad</strong> {quote.accepted_at ? fmtDate(quote.accepted_at) : ""}
              {quote.accepted_name ? ` av ${quote.accepted_name}` : ""}
              {quote.accepted_email ? ` (${quote.accepted_email})` : ""}. Offerten är låst. Behöver något ändras, gör en kopia.
            </p>
            {quote.customer_comment && <p className="text-sm">Kundens kommentar: {quote.customer_comment}</p>}
            {booker && linkedEvent && linkedEvent.status !== "bekraftad" && (
              <form action={confirmEvent.bind(null, id)}>
                <button className="btn btn-primary" type="submit">Sätt evenemanget till Bekräftad</button>
              </form>
            )}
          </>
        )}
        {quote.status === "avbojd" && (
          <>
            <p>
              <strong className="text-warn">Avböjd</strong> {quote.declined_at ? fmtDate(quote.declined_at) : ""}
              {quote.accepted_name ? ` av ${quote.accepted_name}` : ""}.
            </p>
            {quote.customer_comment && <p className="text-sm">Kundens kommentar: {quote.customer_comment}</p>}
            {booker && (
              <form action={backToDraft.bind(null, id)}>
                <button className="btn" type="submit">Öppna som utkast igen</button>
              </form>
            )}
          </>
        )}
      </section>

      <QuoteRooms quoteId={id} eventId={quote.event_id} lookups={lookups} locked={locked} error={sp.fel} />

      {/* Rader */}
      <form id="rader" action={saveLines.bind(null, id)} className="card p-5 grid gap-4 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Rader</h2>
          <span className="flex-1" />
          {!locked && quote.event_id && (
            <button className="btn" formAction={addBookingLines.bind(null, id)} type="submit" formNoValidate>
              Hämta lokaler från bokningarna
            </button>
          )}
        </div>
        {quote.status === "skickad" && !locked && (
          <p className="text-sm text-st-preliminar">Offerten är skickad. Ändringar syns direkt för kunden via länken.</p>
        )}
        <QuoteEditor
          commissionPct={commission}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          articles={articles.map((a) => ({ ...a, price: a.price == null ? null : Number(a.price), cost: Number(a.cost), vat_rate: Number(a.vat_rate) }))}
          initial={lines.map((l) => ({
            group_id: l.group_id,
            article_id: l.article_id,
            description: l.description,
            line_date: l.line_date ?? "",
            quantity: Number(l.quantity),
            unit: l.unit,
            unit_price: Number(l.unit_price),
            cost: Number(l.cost),
            discount_pct: Number(l.discount_pct),
            vat_rate: Number(l.vat_rate),
            kind: l.kind,
          }))}
          readOnly={locked}
        />
      </form>

      {/* Uppgifter */}
      <form action={updateQuote.bind(null, id)} className="card p-5 grid gap-4">
        <h2 className="text-lg font-semibold">Uppgifter och texter</h2>
        <fieldset disabled={locked} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="field">
              <label className="label" htmlFor="title">Rubrik</label>
              <input className="input" id="title" name="title" required defaultValue={quote.title} />
            </div>
            <div className="field">
              <label className="label" htmlFor="language">Språk till kunden</label>
              <select className="input" id="language" name="language" defaultValue={quote.language ?? "sv"}>
                <option value="sv">Svenska</option>
                <option value="en">Engelska</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="valid_until">Giltig till</label>
              <input className="input" id="valid_until" name="valid_until" type="date" defaultValue={quote.valid_until ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="field">
              <label className="label" htmlFor="event_id">Evenemang</label>
              <select className="input" id="event_id" name="event_id" defaultValue={quote.event_id ?? ""}>
                <option value="">Inget</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="company_id">Kund</label>
              <select className="input" id="company_id" name="company_id" defaultValue={quote.company_id ?? ""}>
                <option value="">Ingen</option>
                {lookups.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="contact_id">Kontaktperson</label>
              <select className="input" id="contact_id" name="contact_id" defaultValue={quote.contact_id ?? ""}>
                <option value="">Ingen</option>
                {lookups.contacts
                  .filter((c) => !quote.company_id || c.company_id === quote.company_id || c.id === quote.contact_id)
                  .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="salesperson_id">Säljare</label>
              <select className="input" id="salesperson_id" name="salesperson_id" defaultValue={quote.salesperson_id ?? ""}>
                <option value="">Ingen</option>
                {lookups.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="intro">Inledning till kunden</label>
            <textarea className="input" id="intro" name="intro" defaultValue={quote.intro ?? ""} />
          </div>
          <div className="field">
            <label className="label" htmlFor="terms">Villkor</label>
            <textarea className="input min-h-48" id="terms" name="terms" defaultValue={quote.terms ?? ""} />
            <span className="text-sm text-muted">
              Byter du språk byts inledning och villkor automatiskt om de inte är ändrade. Standardtexterna ändras under{" "}
              <Link className="underline" href="/installningar/offert">Inställningar → Offert</Link>.
            </span>
          </div>
        </fieldset>
        {!locked && <div><button className="btn btn-primary" type="submit">Spara uppgifter</button></div>}
      </form>

      <History quoteId={id} />

      {booker && (
        <div className="flex flex-wrap items-center gap-3">
          <form action={duplicateQuote.bind(null, id)}><button className="btn" type="submit">Kopiera offerten</button></form>
          <span className="flex-1" />
          <form action={deleteQuote.bind(null, id)}>
            <ConfirmButton label="Ta bort offerten" question="Offerten tas bort för gott och kundlänken slutar fungera." confirmLabel="Ta bort" />
          </form>
        </div>
      )}
    </div>
  );
}

function Ok({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{children}</p>;
}

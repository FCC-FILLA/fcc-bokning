import Link from "next/link";
import { canBook, getProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { INVOICE_KIND_LABEL, INVOICE_STATUS_LABEL, type InvoiceKind } from "@/lib/faktura";
import { QUOTE_STATUS_LABEL, fmtKr, type QuoteStatus } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { createInvoice } from "@/app/(app)/fakturor/actions";

type Q = { id: string; number: number; title: string; status: QuoteStatus; total_ex_vat: number };
type I = { id: string; number: number; kind: InvoiceKind; percent: number | null; status: string; total_ex_vat: number; total_vat: number; created_at: string; sent_at: string | null };

/** Fakturering på evenemanget: vad som är offererat, fakturerat och kvar, och nya underlag. */
export async function EventInvoicing({ eventId, quotes }: { eventId: string; quotes: Q[] }) {
  const booker = canBook(await getProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("invoice_overview").select("id, number, kind, percent, status, total_ex_vat, total_vat, created_at, sent_at").eq("event_id", eventId).order("number");
  const invoices = (data ?? []) as I[];
  const accepted = quotes.filter((q) => q.status === "accepterad");
  const basis = accepted.reduce((s, q) => s + Number(q.total_ex_vat), 0);
  const invoiced = invoices.filter((i) => i.status !== "makulerad").reduce((s, i) => s + Number(i.total_ex_vat), 0);
  const left = Math.round((basis - invoiced) * 100) / 100;

  return (
    <section id="fakturering" className="card p-5 grid gap-4 scroll-mt-28">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Fakturering</h2>
        <span className="text-sm text-muted">Underlagen mejlas till ekonomi som PDF med bilagor.</span>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-sunk p-3"><dt className="label">Accepterade offerter</dt><dd className="text-lg font-semibold tabular-nums">{fmtKr(basis)}</dd></div>
        <div className="rounded-lg bg-sunk p-3"><dt className="label">Fakturerat</dt><dd className="text-lg font-semibold tabular-nums">{fmtKr(invoiced)}</dd></div>
        <div className={`rounded-lg p-3 ${left > 0 ? "bg-st-preliminar-soft" : "bg-st-genomford-soft"}`}><dt className="label">Kvar att fakturera</dt><dd className="text-lg font-semibold tabular-nums">{fmtKr(left)}</dd></div>
      </dl>
      <p className="text-xs text-muted -mt-2">Belopp exkl. moms.</p>

      {invoices.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {invoices.map((i) => (
            <li key={i.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${i.status === "makulerad" ? "opacity-50 line-through" : ""}`}>
              <Link className="font-semibold hover:underline" href={`/fakturor/${i.id}`}>Underlag {i.number}</Link>
              <span className="text-muted">{INVOICE_KIND_LABEL[i.kind]}{i.kind === "del" && i.percent != null ? ` ${Number(i.percent)} %` : ""}</span>
              <span className="flex-1" />
              <span className="tabular-nums">{fmtKr(Number(i.total_ex_vat))}</span>
              <span className="text-xs text-muted">{INVOICE_STATUS_LABEL[i.status]}{i.sent_at ? ` ${fmtDate(i.sent_at)}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {booker && quotes.length > 0 && (
        <details className="rounded-lg border border-line p-4" open={invoices.length === 0 && accepted.length > 0}>
          <summary className="cursor-pointer font-semibold">Nytt fakturaunderlag</summary>
          <form action={createInvoice.bind(null, eventId)} className="mt-3 grid gap-4">
            <fieldset className="grid gap-1.5">
              <legend className="label mb-1">Offerter som underlag</legend>
              {quotes.map((q) => (
                <label key={q.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="checkbox" name="quote_ids" value={q.id} defaultChecked={q.status === "accepterad"} />
                  #{q.number} {q.title} <span className="text-muted">{fmtKr(Number(q.total_ex_vat))} · {QUOTE_STATUS_LABEL[q.status]}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="label mb-1">Vad ska faktureras</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="del" defaultChecked={invoices.length === 0} /> En del i procent, t.ex. förskott
                <input className="input h-8 w-20 py-0 text-right" name="percent" inputMode="decimal" defaultValue="30" aria-label="Procent" /> %</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="slut" defaultChecked={invoices.length > 0} /> Slutfaktura: allt minus det som redan fakturerats</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="hela" /> Hela beloppet</label>
            </fieldset>
            <div><button className="btn btn-primary" type="submit">Skapa underlag</button></div>
          </form>
        </details>
      )}
    </section>
  );
}

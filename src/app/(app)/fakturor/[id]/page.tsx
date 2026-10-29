import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { INVOICE_KIND_LABEL, INVOICE_STATUS_LABEL, invoiceTotals, lineAmount, type InvoiceKind } from "@/lib/faktura";
import { fmtKr } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { InvoiceLinesEditor } from "@/components/invoice-lines";
import { deleteInvoice, saveInvoice, sendInvoice, voidInvoice } from "../actions";

export const metadata = { title: "Fakturaunderlag" };

type Line = { id: string; description: string; quantity: number; unit: string | null; unit_price: number; vat_rate: number; quote_id: string | null };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fel?: string; sparat?: string; skickad?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const booker = canBook(await requireProfile());
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoice_overview").select("*").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const [{ data: lineData }, { data: docs }, { data: att }, { data: to }] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("event_documents").select("id, name").eq("event_id", inv.event_id).order("created_at", { ascending: false }),
    supabase.from("invoice_attachments").select("document_id").eq("invoice_id", id),
    supabase.from("app_settings").select("value").eq("key", "invoice_email_to").maybeSingle(),
  ]);
  const lines = ((lineData ?? []) as Line[]).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: Number(l.vat_rate) }));
  const chosen = new Set(((att ?? []) as { document_id: string }[]).map((x) => x.document_id));
  const editable = booker && inv.status === "utkast";
  const t = invoiceTotals(lines);
  const r = (inv.recipient ?? {}) as Record<string, string | null>;

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-2">
        <Link href={`/evenemang/${inv.event_id}#fakturering`} className="text-sm text-muted hover:underline">← {inv.event_title}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Fakturaunderlag {inv.number}</h1>
          <span className={`pill ${inv.status === "skickad" ? "st-genomford" : inv.status === "makulerad" ? "st-avbokad" : "st-preliminar"}`}>{INVOICE_STATUS_LABEL[inv.status]}</span>
          <span className="text-sm text-muted">{INVOICE_KIND_LABEL[inv.kind as InvoiceKind]}{inv.kind === "del" ? ` ${Number(inv.percent)} %` : ""}</span>
          <span className="flex-1" />
          <a className="btn" href={`/fakturor/${id}/pdf`} target="_blank" rel="noreferrer">Visa PDF</a>
        </div>
        {inv.sent_at && <p className="text-sm text-muted">Skickat till {inv.sent_to} {fmtDate(inv.sent_at)}.</p>}
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {sp.skickad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Underlaget är skickat till ekonomi med PDF och bilagor.</p>}

      <form action={saveInvoice.bind(null, id)} className="grid gap-5">
        <section className="card p-5 grid gap-4 sm:grid-cols-3">
          <div className="grid gap-0.5 text-sm">
            <span className="label">Kund</span>
            <span className="font-semibold">{r.name ?? inv.company_name ?? "Ingen kund"}</span>
            {r.org_nr && <span>Org.nr {r.org_nr}</span>}
            <span className="text-muted">{r.invoice_address || [r.address, [r.postal_code, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>
            {r.invoice_email && <span className="text-muted">Faktura: {r.invoice_email}</span>}
          </div>
          <fieldset disabled={!editable} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <div className="field"><label className="label" htmlFor="customer_reference">Er referens</label><input className="input" id="customer_reference" name="customer_reference" defaultValue={inv.customer_reference ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="our_reference">Vår referens</label><input className="input" id="our_reference" name="our_reference" defaultValue={inv.our_reference ?? ""} placeholder="Den som skapade underlaget" /></div>
            <div className="field"><label className="label" htmlFor="invoice_date">Fakturadatum</label><input className="input" id="invoice_date" name="invoice_date" type="date" defaultValue={inv.invoice_date} /></div>
            <div className="field"><label className="label" htmlFor="due_days">Betalningsvillkor (dagar)</label><input className="input" id="due_days" name="due_days" type="number" min={0} max={365} defaultValue={inv.due_days} /></div>
          </fieldset>
        </section>

        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Rader</h2>
          {editable ? (
            <InvoiceLinesEditor lines={lines} />
          ) : (
            <table className="table">
              <thead><tr><th>Beskrivning</th><th className="text-right">Antal</th><th className="text-right">À-pris</th><th className="text-right">Moms</th><th className="text-right">Belopp</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}><td>{l.description}</td><td className="text-right">{l.quantity} {l.unit}</td><td className="text-right">{fmtKr(l.unit_price)}</td><td className="text-right">{l.vat_rate} %</td><td className="text-right">{fmtKr(lineAmount(l))}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted">Summa exkl. moms</dt><dd className="text-right">{fmtKr(t.net)}</dd>
            {t.byVat.map(([v, x]) => (
              <Fragment key={v}><dt className="text-muted">Moms {v} %</dt><dd className="text-right">{fmtKr(x.vat)}</dd></Fragment>
            ))}
            <dt className="font-semibold">Att fakturera</dt><dd className="text-right font-semibold">{fmtKr(t.total)}</dd>
          </dl>
          {editable && <p className="text-xs text-muted">Spara för att räkna om summorna efter ändringar.</p>}
        </section>

        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Bilagor och meddelande</h2>
          {(docs ?? []).length === 0 ? (
            <p className="text-sm text-muted">Evenemanget har inga dokument. Ladda upp under Genomförande så kan de bifogas här.</p>
          ) : (
            <fieldset disabled={!editable} className="grid gap-1.5">
              {((docs ?? []) as { id: string; name: string }[]).map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="attachments" value={d.id} defaultChecked={chosen.has(d.id)} /> {d.name}</label>
              ))}
            </fieldset>
          )}
          <div className="field">
            <label className="label" htmlFor="note">Meddelande till ekonomi</label>
            <textarea className="input min-h-20" id="note" name="note" defaultValue={inv.note ?? ""} disabled={!editable} placeholder="T.ex. fakturera via Peppol, märk med PO-nummer …" />
          </div>
        </section>

        {editable && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
      </form>

      {booker && inv.status === "utkast" && (
        <section className="card p-5 flex flex-wrap items-center gap-3">
          <form action={sendInvoice.bind(null, id)}>
            <ConfirmButton className="btn btn-primary" label="Skicka till ekonomi" question={`Skicka underlaget till ${to?.value || "(adress saknas)"}? Spara först om du ändrat något.`} confirmLabel="Skicka" />
          </form>
          <span className="text-sm text-muted">{to?.value ? `Går till ${to.value}.` : "Ange adressen under Inställningar → E-post."}</span>
          <span className="flex-1" />
          <form action={deleteInvoice.bind(null, id)}>
            <ConfirmButton className="btn btn-ghost text-warn" label="Ta bort utkastet" question="Ta bort underlaget?" confirmLabel="Ta bort" />
          </form>
        </section>
      )}
      {booker && inv.status === "skickad" && (
        <form action={voidInvoice.bind(null, id)}>
          <ConfirmButton className="btn btn-ghost text-warn" label="Makulera" question="Makulera underlaget? Det räknas då inte som fakturerat." confirmLabel="Makulera" />
        </form>
      )}
    </div>
  );
}

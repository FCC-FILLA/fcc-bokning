"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBooker } from "@/lib/auth";
import { buildInvoiceLines, invoiceTotals, type InvoiceKind } from "@/lib/faktura";
import { loadInvoicePdfData } from "@/lib/faktura-doc";
import { kickMail } from "@/lib/epost";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { createClient } from "@/lib/supabase/server";

const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}fel=${encodeURIComponent(msg)}`);
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));

/** Skapar ett nytt underlag från valda offerter på evenemanget. */
export async function createInvoice(eventId: string, fd: FormData) {
  await requireBooker();
  const back = `/evenemang/${eventId}#fakturering`;
  const quoteIds = fd.getAll("quote_ids").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!quoteIds.length) fail(back, "Välj minst en offert.");
  const kind = (["hela", "del", "slut"].includes(String(fd.get("kind"))) ? String(fd.get("kind")) : "hela") as InvoiceKind;
  const percent = kind === "del" ? num(fd.get("percent")) : null;
  if (kind === "del" && !(percent! > 0 && percent! <= 100)) fail(back, "Ange en procentsats mellan 1 och 100.");
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("company_id, companies(name, org_nr, address, postal_code, city, invoice_email, invoice_address, invoice_reference)").eq("id", eventId).single();
  const company = (ev as unknown as { companies: Record<string, string | null> | null } | null)?.companies ?? {};
  const lines = await buildInvoiceLines(supabase, eventId, quoteIds, kind, percent);
  if (!lines.length) fail(back, "Offerterna har inga rader att fakturera.");
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({ event_id: eventId, kind, percent, company_id: ev?.company_id ?? null, recipient: company, quote_ids: quoteIds, customer_reference: company.invoice_reference ?? null })
    .select("id")
    .single();
  if (error || !inv) fail(back, "Det gick inte att skapa underlaget.");
  await supabase.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: inv!.id })));
  revalidatePath(`/evenemang/${eventId}`);
  redirect(`/fakturor/${inv!.id}`);
}

export async function saveInvoice(id: string, fd: FormData) {
  await requireBooker();
  const supabase = await createClient();
  const path = `/fakturor/${id}`;
  const { data: inv } = await supabase.from("invoices").select("status, event_id").eq("id", id).single();
  if (!inv) fail("/fakturor", "Underlaget finns inte.");
  if (inv!.status !== "utkast") fail(path, "Underlaget är skickat och kan inte ändras.");
  const date = String(fd.get("invoice_date") ?? "");
  await supabase
    .from("invoices")
    .update({
      customer_reference: String(fd.get("customer_reference") ?? "").trim() || null,
      our_reference: String(fd.get("our_reference") ?? "").trim() || null,
      invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      due_days: Math.max(0, Math.min(365, Math.round(num(fd.get("due_days"))) || 30)),
      note: String(fd.get("note") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  // Raderna: ersätt alla med det som skickades.
  const n = Number(fd.get("line_count") ?? 0);
  const lines = Array.from({ length: n }, (_, i) => ({
    invoice_id: id,
    description: String(fd.get(`d_${i}`) ?? "").trim(),
    quantity: num(fd.get(`q_${i}`)) || 0,
    unit: String(fd.get(`u_${i}`) ?? "").trim() || null,
    unit_price: num(fd.get(`p_${i}`)) || 0,
    vat_rate: [0, 6, 12, 25].includes(num(fd.get(`v_${i}`))) ? num(fd.get(`v_${i}`)) : 25,
    quote_id: String(fd.get(`qid_${i}`) ?? "") || null,
    sort_order: i,
  })).filter((l, i) => l.description && fd.get(`x_${i}`) !== "on");
  await supabase.from("invoice_lines").delete().eq("invoice_id", id);
  if (lines.length) await supabase.from("invoice_lines").insert(lines);
  // Bilagor.
  const docs = fd.getAll("attachments").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  await supabase.from("invoice_attachments").delete().eq("invoice_id", id);
  if (docs.length) await supabase.from("invoice_attachments").insert(docs.map((document_id) => ({ invoice_id: id, document_id })));
  revalidatePath(path);
  redirect(`${path}?sparat=1`);
}

/** Skapar PDF:en, lägger den i underlag-hinken och mejlar den med bilagorna till ekonomi. */
export async function sendInvoice(id: string) {
  const p = await requireBooker();
  const supabase = await createClient();
  const path = `/fakturor/${id}`;
  const [{ data: to }, d] = await Promise.all([supabase.from("app_settings").select("value").eq("key", "invoice_email_to").maybeSingle(), loadInvoicePdfData(supabase, id)]);
  if (!d) fail("/fakturor", "Underlaget finns inte.");
  const address = (to?.value ?? "").trim();
  if (!address) fail(path, "Ange vart underlagen ska skickas under Inställningar → E-post.");
  if (!d!.lines.length) fail(path, "Underlaget har inga rader.");
  const pdf = await renderInvoicePdf(d!);
  const pdfPath = `fakturaunderlag/${id}-${Date.now()}.pdf`;
  const up = await supabase.storage.from("underlag").upload(pdfPath, pdf, { contentType: "application/pdf" });
  if (up.error) fail(path, "Det gick inte att spara PDF:en.");
  const t = invoiceTotals(d!.lines);
  const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
  const body = [
    `Hej!`,
    ``,
    `Här kommer fakturaunderlag ${d!.number} för ${d!.event.title}${d!.event.dates ? ` (${d!.event.dates})` : ""}.`,
    `Kund: ${d!.recipient.name ?? "–"}${d!.recipient.org_nr ? `, org.nr ${d!.recipient.org_nr}` : ""}`,
    `Att fakturera: ${kr(t.total)} inkl. moms (${kr(t.net)} exkl. moms).`,
    d!.note ? `\n${d!.note}` : "",
    ``,
    `Underlaget och ${d!.docs.length} bilaga${d!.docs.length === 1 ? "" : "or"} finns bifogade.`,
    ``,
    `Hälsningar`,
    p.full_name || p.email,
  ].join("\n");
  const { error } = await supabase.from("email_outbox").insert({
    to_email: address,
    subject: `Fakturaunderlag ${d!.number} – ${d!.recipient.name ?? d!.event.title}`,
    body,
    kind: "fakturaunderlag",
    event_id: d!.eventId,
    reply_to: p.email,
    attachments: [
      { bucket: "underlag", path: pdfPath, name: `Fakturaunderlag-${d!.number}.pdf` },
      ...d!.docs.filter((x) => x.storage_path).map((x) => ({ bucket: "dokument", path: x.storage_path!, name: x.name })),
    ],
  });
  if (error) fail(path, "Det gick inte att lägga mejlet i kön.");
  await supabase.from("invoices").update({ status: "skickad", sent_at: new Date().toISOString(), sent_to: address, pdf_path: pdfPath }).eq("id", id);
  await kickMail();
  revalidatePath(path);
  revalidatePath(`/evenemang/${d!.eventId}`);
  redirect(`${path}?skickad=1`);
}

export async function voidInvoice(id: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("invoices").update({ status: "makulerad" }).eq("id", id);
  revalidatePath(`/fakturor/${id}`);
  redirect(`/fakturor/${id}`);
}

export async function deleteInvoice(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("event_id, status").eq("id", id).single();
  if (data?.status !== "utkast") fail(`/fakturor/${id}`, "Bara utkast kan tas bort.");
  await supabase.from("invoices").delete().eq("id", id);
  redirect(`/evenemang/${data!.event_id}#fakturering`);
}

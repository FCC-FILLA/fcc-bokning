import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/datum";
import { loadCompany } from "@/lib/foretag";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import type { InvoiceKind } from "@/lib/faktura";

export async function loadInvoicePdfData(supabase: SupabaseClient, id: string): Promise<(InvoicePdfData & { eventId: string; docs: { id: string; name: string; storage_path: string | null }[] }) | null> {
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv) return null;
  const [{ data: lines }, { data: ev }, { data: bookings }, { data: quotes }, { data: att }, company, { data: accent }, { data: me }] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("events").select("id, title").eq("id", inv.event_id).single(),
    supabase.from("bookings").select("starts_at, ends_at").eq("event_id", inv.event_id).order("starts_at"),
    supabase.from("quotes").select("number, title").in("id", inv.quote_ids ?? []),
    supabase.from("invoice_attachments").select("event_documents(id, name, storage_path)").eq("invoice_id", id),
    loadCompany(supabase),
    supabase.from("app_settings").select("value").eq("key", "look_accent").maybeSingle(),
    inv.created_by ? supabase.from("profiles").select("full_name").eq("id", inv.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const b = (bookings ?? []) as { starts_at: string; ends_at: string }[];
  const docs = ((att ?? []) as unknown as { event_documents: { id: string; name: string; storage_path: string | null } | null }[]).map((x) => x.event_documents).filter((x): x is NonNullable<typeof x> => !!x);
  return {
    eventId: inv.event_id,
    docs,
    number: inv.number,
    kind: inv.kind as InvoiceKind,
    percent: inv.percent == null ? null : Number(inv.percent),
    invoice_date: inv.invoice_date,
    due_days: inv.due_days,
    customer_reference: inv.customer_reference,
    our_reference: inv.our_reference || (me as { full_name: string | null } | null)?.full_name || null,
    note: inv.note,
    recipient: inv.recipient ?? {},
    event: { title: ev?.title ?? "", dates: b.length ? (b.length > 1 && fmtDate(b[0].starts_at) !== fmtDate(b.at(-1)!.starts_at) ? `${fmtDate(b[0].starts_at)} – ${fmtDate(b.at(-1)!.starts_at)}` : fmtDate(b[0].starts_at)) : "" },
    quotes: ((quotes ?? []) as { number: number; title: string }[]).map((q) => `offert ${q.number}`),
    lines: ((lines ?? []) as InvoicePdfData["lines"]).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: Number(l.vat_rate) })),
    attachments: docs.map((x) => x.name),
    company,
    accent: /^#[0-9a-f]{6}$/i.test(accent?.value ?? "") ? accent!.value : "#60272b",
  };
}

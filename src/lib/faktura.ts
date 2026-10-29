import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceKind = "hela" | "del" | "slut";
export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = { hela: "Hela beloppet", del: "Del i procent", slut: "Slutfaktura" };
export const INVOICE_STATUS_LABEL: Record<string, string> = { utkast: "Utkast", skickad: "Skickad till ekonomi", makulerad: "Makulerad" };

export type InvoiceLine = { description: string; quantity: number; unit: string | null; unit_price: number; vat_rate: number; quote_id: string | null; sort_order: number };

type QLine = { quote_id: string; description: string; quantity: number; unit: string | null; unit_price: number; discount_pct: number; vat_rate: number; kind: string; sort_order: number; line_date: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const lineAmount = (l: { quantity: number; unit_price: number }) => r2(Number(l.quantity) * Number(l.unit_price));

/** Summa exkl. moms, moms per sats och totalt. */
export function invoiceTotals(lines: { quantity: number; unit_price: number; vat_rate: number }[]) {
  const byVat = new Map<number, { base: number; vat: number }>();
  for (const l of lines) {
    const base = lineAmount(l);
    const v = Number(l.vat_rate);
    const cur = byVat.get(v) ?? { base: 0, vat: 0 };
    cur.base = r2(cur.base + base);
    cur.vat = r2(cur.vat + r2((base * v) / 100));
    byVat.set(v, cur);
  }
  const net = r2([...byVat.values()].reduce((s, x) => s + x.base, 0));
  const vat = r2([...byVat.values()].reduce((s, x) => s + x.vat, 0));
  return { net, vat, total: r2(net + vat), byVat: [...byVat].sort((a, b) => b[0] - a[0]) };
}

/**
 * Bygger raderna för ett nytt underlag från offerterna.
 * - hela: alla ingående rader.
 * - del: procent av offerternas summa, en rad per offert och momssats.
 * - slut: alla rader, minus det som redan fakturerats på evenemanget (per momssats).
 */
export async function buildInvoiceLines(supabase: SupabaseClient, eventId: string, quoteIds: string[], kind: InvoiceKind, percent: number | null) {
  const [{ data: ql }, { data: quotes }, { data: prev }] = await Promise.all([
    supabase.from("quote_lines").select("quote_id, description, quantity, unit, unit_price, discount_pct, vat_rate, kind, sort_order, line_date").in("quote_id", quoteIds).eq("kind", "ingar").order("sort_order"),
    supabase.from("quotes").select("id, number, title").in("id", quoteIds),
    supabase.from("invoices").select("id, number, invoice_lines(quantity, unit_price, vat_rate)").eq("event_id", eventId).neq("status", "makulerad"),
  ]);
  const qname = new Map(((quotes ?? []) as { id: string; number: number; title: string }[]).map((q) => [q.id, `offert ${q.number} ${q.title}`]));
  const src = ((ql ?? []) as QLine[]).sort((a, b) => quoteIds.indexOf(a.quote_id) - quoteIds.indexOf(b.quote_id) || a.sort_order - b.sort_order);
  const out: InvoiceLine[] = [];
  const push = (l: Omit<InvoiceLine, "sort_order">) => out.push({ ...l, sort_order: out.length });

  if (kind === "del") {
    const p = Math.max(0, Math.min(100, percent ?? 0));
    for (const qid of quoteIds) {
      const byVat = new Map<number, number>();
      for (const l of src.filter((x) => x.quote_id === qid)) {
        const v = Number(l.vat_rate);
        byVat.set(v, r2((byVat.get(v) ?? 0) + Number(l.quantity) * Number(l.unit_price) * (1 - Number(l.discount_pct) / 100)));
      }
      for (const [v, sum] of [...byVat].sort((a, b) => b[0] - a[0])) {
        push({ description: `${p.toLocaleString("sv-SE")} % av ${qname.get(qid)}${byVat.size > 1 ? ` (moms ${v} %)` : ""}`, quantity: 1, unit: "st", unit_price: r2((sum * p) / 100), vat_rate: v, quote_id: qid });
      }
    }
    return out;
  }

  for (const l of src) {
    const price = r2(Number(l.unit_price) * (1 - Number(l.discount_pct) / 100));
    push({ description: l.description, quantity: Number(l.quantity), unit: l.unit, unit_price: price, vat_rate: Number(l.vat_rate), quote_id: l.quote_id });
  }
  if (kind === "slut") {
    const prevList = (prev ?? []) as { number: number; invoice_lines: { quantity: number; unit_price: number; vat_rate: number }[] }[];
    const byVat = new Map<number, number>();
    for (const inv of prevList) for (const l of inv.invoice_lines) byVat.set(Number(l.vat_rate), r2((byVat.get(Number(l.vat_rate)) ?? 0) + lineAmount(l)));
    const nums = prevList.map((x) => x.number).join(", ");
    for (const [v, sum] of [...byVat].sort((a, b) => b[0] - a[0])) {
      if (sum) push({ description: `Avgår tidigare fakturerat (underlag ${nums})${byVat.size > 1 ? `, moms ${v} %` : ""}`, quantity: 1, unit: "st", unit_price: -sum, vat_rate: v, quote_id: null });
    }
  }
  return out;
}

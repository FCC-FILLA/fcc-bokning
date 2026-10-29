import { describe, expect, it } from "vitest";
import { buildInvoiceLines, invoiceTotals } from "../src/lib/faktura";
import { renderInvoicePdf } from "../src/lib/pdf/invoice-pdf";
import { DEFAULT_COMPANY } from "../src/lib/foretag";

// Minimal låtsas-Supabase som svarar med fasta rader per tabell.
function fake(tables: Record<string, unknown[]>) {
  return {
    from(t: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "neq", "order"]) q[m] = () => q;
      (q as { then: unknown }).then = (res: (v: { data: unknown[] }) => unknown) => res({ data: tables[t] ?? [] });
      return q;
    },
  } as never;
}

const Q = "11111111-1111-1111-1111-111111111111";
const base = {
  quote_lines: [
    { quote_id: Q, description: "Lokalhyra", quantity: 1, unit: "dag", unit_price: 10000, discount_pct: 0, vat_rate: 25, kind: "ingar", sort_order: 0, line_date: null },
    { quote_id: Q, description: "Lunch", quantity: 100, unit: "st", unit_price: 100, discount_pct: 10, vat_rate: 12, kind: "ingar", sort_order: 1, line_date: null },
  ],
  quotes: [{ id: Q, number: 1002, title: "Konferens" }],
};

describe("fakturaunderlag", () => {
  it("delfaktura blir procent per momssats", async () => {
    const lines = await buildInvoiceLines(fake({ ...base, invoices: [] }), "e", [Q], "del", 30);
    expect(lines.map((l) => [l.unit_price, l.vat_rate])).toEqual([[3000, 25], [2700, 12]]);
  });

  it("slutfaktura räknar av tidigare fakturerat per momssats", async () => {
    const prev = [{ number: 1001, invoice_lines: [{ quantity: 1, unit_price: 3000, vat_rate: 25 }, { quantity: 1, unit_price: 2700, vat_rate: 12 }] }];
    const lines = await buildInvoiceLines(fake({ ...base, invoices: prev }), "e", [Q], "slut", null);
    const t = invoiceTotals(lines);
    expect(t.net).toBe(10000 + 9000 - 3000 - 2700);
    expect(t.vat).toBe(Math.round(((10000 - 3000) * 0.25 + (9000 - 2700) * 0.12) * 100) / 100);
    expect(lines.at(-1)!.description).toContain("1001");
  });

  it("PDF:en går att skapa", async () => {
    const pdf = await renderInvoicePdf({
      number: 1001, kind: "del", percent: 30, invoice_date: "2026-11-01", due_days: 30, customer_reference: null, our_reference: "Pontus", note: "Märk med PO 123",
      recipient: { name: "Kund AB", org_nr: "556000-0000" }, event: { title: "Konferens", dates: "1 nov" }, quotes: ["offert 1002"],
      lines: [{ description: "30 % av offert 1002", quantity: 1, unit: "st", unit_price: 3000, vat_rate: 25 }], attachments: ["Avtal.pdf"], company: DEFAULT_COMPANY, accent: "#60272b",
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

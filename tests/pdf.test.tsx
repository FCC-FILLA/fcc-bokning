import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "../src/lib/pdf/quote-pdf";
import type { QuoteDoc } from "../src/lib/offert-doc";

describe("offert-pdf", () => {
  it("skapar en PDF med svenska tecken", async () => {
    const doc: QuoteDoc = {
      number: 1001,
      title: "Vårkonsert på Läktare & Balkong",
      status: "skickad",
      valid_until: "2027-03-01",
      intro: "Tack för förfrågan!",
      terms: "Betalning 30 dagar netto.",
      sent_at: "2027-01-15T10:00:00Z",
      accepted_at: null,
      accepted_name: null,
      declined_at: null,
      company_name: "Körföreningen Ö",
      contact_name: "Åsa Ängström",
      salesperson_name: "Pontus",
      salesperson_email: null,
      event_title: "Vårkonsert",
      bookings: [{ room: "Stora salen, hela", starts_at: "2027-03-05T06:00:00Z", ends_at: "2027-03-05T22:00:00Z" }],
      lines: [
        { group: "Lokal", group_order: 1, description: "Stora salen", line_date: "2027-03-05", quantity: 1, unit: "dag", unit_price: 90000, discount_pct: 20, vat_rate: 25, kind: "ingar" },
        { group: "Mat & dryck", group_order: 4, description: "Hyra kök", line_date: null, quantity: 1, unit: "st", unit_price: 3000, discount_pct: 0, vat_rate: 25, kind: "tillval" },
      ],
    };
    const buf = await renderQuotePdf(doc);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 30000);
});

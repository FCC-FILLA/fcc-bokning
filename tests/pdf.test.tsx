import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "../src/lib/pdf/quote-pdf";
import type { QuoteDoc } from "../src/lib/offert-doc";
import { DEFAULT_COMPANY } from "../src/lib/foretag";

function makeDoc(): QuoteDoc {
  return {
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
      participants: 800,
      language: "sv",
      look: { cover: "", closing: "Varmt välkomna!", showRooms: true, showProgram: true, showAddons: true, showImages: true },
      company: { ...DEFAULT_COMPANY, orgnr: "556000-0000", phone: "08-123 45 67", web: "filadelfiaconventioncenter.se" },
      rooms: [{ name: "Stora salen, hela", image: "/lokaler/stora-salen.jpg", gallery: [], text: "Kyrksal med läktare.", kvm: 1200, max: 3000 }],
      bookings: [{ room: "Stora salen, hela", starts_at: "2027-03-05T06:00:00Z", ends_at: "2027-03-05T22:00:00Z" }],
      lines: [
        { group: "Lokal", group_order: 1, description: "Stora salen", line_date: "2027-03-05", quantity: 1, unit: "dag", unit_price: 90000, discount_pct: 20, vat_rate: 25, kind: "ingar", image: "/lokaler/stora-salen.jpg", gallery: [], icon: "room", text: "Stockholms största sal." },
        { group: "Mat & dryck", group_order: 4, description: "Hyra kök", line_date: null, quantity: 1, unit: "st", unit_price: 3000, discount_pct: 0, vat_rate: 25, kind: "tillval", image: null, gallery: [], icon: "meal", text: null },
      ],
  };
}

describe("offert-pdf", () => {
  it("skapar en PDF med svenska tecken", async () => {
    const doc = makeDoc();
    const buf = await renderQuotePdf(doc, new Map([["/lokaler/stora-salen.jpg", readFileSync("public/lokaler/stora-salen.jpg")]]));
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 30000);

  it("kan skrivas på engelska", async () => {
    const doc = makeDoc();
    const buf = await renderQuotePdf({ ...doc, language: "en", look: { ...doc.look, closing: "Welcome!" } });
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace(".pdf", "-en.pdf"), buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);
});

import { describe, expect, it } from "vitest";
import { quoteTotals } from "../src/lib/offert";

describe("offertberäkning", () => {
  it("räknar rabatt, moms, marginal och tillval som ShowWizrd-offerten HappyVoices", () => {
    const t = quoteTotals([
      { quantity: 1, unit_price: 90000, cost: 10000, discount_pct: 20, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 38500, cost: 2500, discount_pct: 100, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 13200, discount_pct: 100, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 13200, discount_pct: 100, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 6500, discount_pct: 0, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 13200, discount_pct: 0, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 12000, discount_pct: 0, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 6000, discount_pct: 0, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 58000, discount_pct: 0, vat_rate: 25, kind: "ingar" },
      { quantity: 1, unit_price: 3000, discount_pct: 0, vat_rate: 25, kind: "tillval" },
      { quantity: 1, unit_price: 40, discount_pct: 0, vat_rate: 25, kind: "tillval" },
      { quantity: 1, unit_price: 60, discount_pct: 0, vat_rate: 25, kind: "tillval" },
    ]);
    expect(t.beforeDiscount).toBe(250600);
    expect(t.discount).toBe(82900);
    expect(t.exVat).toBe(167700);
    expect(t.vat).toBe(41925);
    expect(t.inclVat).toBe(209625);
    expect(t.cost).toBe(12500);
    expect(t.margin).toBe(155200);
    expect(t.addonsExVat).toBe(3100);
    expect(t.addonsInclVat).toBe(3875);
  });

  it("avrundar till öre", () => {
    const t = quoteTotals([{ quantity: 3, unit_price: 33.333, discount_pct: 0, vat_rate: 12, kind: "ingar" }]);
    expect(t.exVat).toBe(100);
    expect(t.vat).toBe(12);
  });
});

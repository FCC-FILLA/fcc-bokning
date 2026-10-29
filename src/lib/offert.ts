// Beräkningar för offerter. Samma regler som vyn quote_overview i databasen:
// radbelopp = antal × à-pris × (1 − rabatt), avrundat till öre. Moms per rad.
// Tillval räknas separat och ingår inte i totalen.

export type LineKind = "ingar" | "tillval";
export type QuoteStatus = "utkast" | "skickad" | "accepterad" | "avbojd";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  utkast: "Utkast",
  skickad: "Skickad",
  accepterad: "Accepterad",
  avbojd: "Avböjd",
};

export type CalcLine = {
  quantity: number;
  unit_price: number;
  cost?: number;
  discount_pct: number;
  vat_rate: number;
  kind: LineKind;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineGross(l: CalcLine) {
  return round2(l.quantity * l.unit_price);
}

export function lineTotal(l: CalcLine) {
  return round2(l.quantity * l.unit_price * (1 - l.discount_pct / 100));
}

export function quoteTotals(lines: CalcLine[]) {
  const incl = lines.filter((l) => l.kind === "ingar");
  const addons = lines.filter((l) => l.kind === "tillval");
  const beforeDiscount = round2(incl.reduce((s, l) => s + lineGross(l), 0));
  const exVat = round2(incl.reduce((s, l) => s + lineTotal(l), 0));
  const vat = round2(incl.reduce((s, l) => s + round2(lineTotal(l) * (l.vat_rate / 100)), 0));
  const cost = round2(incl.reduce((s, l) => s + (l.cost ?? 0) * l.quantity, 0));
  const addonsExVat = round2(addons.reduce((s, l) => s + lineTotal(l), 0));
  return {
    beforeDiscount,
    discount: round2(beforeDiscount - exVat),
    exVat,
    vat,
    inclVat: round2(exVat + vat),
    cost,
    margin: round2(exVat - cost),
    addonsExVat,
    addonsInclVat: round2(addons.reduce((s, l) => s + lineTotal(l) * (1 + l.vat_rate / 100), 0)),
  };
}

const whole = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "12 345 kr", eller med två decimaler om det finns ören: "68 962,50 kr". */
export function fmtKr(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "–";
  return `${(Number.isInteger(Math.round(n * 100) / 100) ? whole : cents).format(n)} kr`;
}

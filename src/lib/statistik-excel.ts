import ExcelJS from "exceljs";
import { MONTHS, pct, summarize, type Stats } from "@/lib/statistik";

/** Statistiken för ett år som Excel (för styrelsen). */
export async function buildStatsWorkbook(s: Stats) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FCC Bokning";
  wb.created = new Date();
  const brand = "FF60272B";
  const header = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } }));
  };
  const t = summarize(s);

  const a = wb.addWorksheet("Sammanfattning");
  a.addRow([`Statistik ${s.year}`]).font = { bold: true, size: 14 };
  a.addRow([]);
  for (const [k, v] of [
    ["Evenemang (bekräftade och genomförda)", t.events],
    ["Avbokade evenemang", t.cancelled],
    ["Gäster (enligt evenemangen)", s.participants],
    ["Skickade offerter", t.sent],
    ["Offererat värde exkl. moms (kr)", t.sentValue],
    ["Vunna offerter", t.won],
    ["Vunnet värde exkl. moms (kr)", t.wonValue],
    ["Förlorade offerter", t.lost],
    ["Vinstandel (vunna av besvarade)", t.winRate == null ? "–" : `${t.winRate} %`],
  ] as [string, string | number][]) a.addRow([k, v]);
  a.getColumn(1).width = 40;
  a.getColumn(2).width = 18;
  a.getColumn(2).numFmt = "#,##0";

  const o = wb.addWorksheet("Beläggning", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  o.addRow(["Andel dagar med bekräftad bokning per lokal och månad"]).font = { bold: true };
  header(o.addRow(["Lokal", ...MONTHS, "Timmar"]));
  for (const r of s.occupancy) {
    o.addRow([r.room, ...r.months.map((m) => pct(m) / 100), r.months.reduce((x, m) => x + Number(m.hours), 0)]);
  }
  o.getColumn(1).width = 28;
  for (let i = 2; i <= 13; i++) { o.getColumn(i).numFmt = "0%"; o.getColumn(i).width = 7; }
  o.getColumn(14).numFmt = "#,##0";

  const q = wb.addWorksheet("Offerter");
  header(q.addRow(["Månad", "Skickade", "Offererat (kr)", "Vunna", "Vunnet (kr)", "Förlorade", "Förlorat (kr)"]));
  for (const m of s.quotes) q.addRow([MONTHS[m.m - 1], m.sent, Number(m.sent_value), m.won, Number(m.won_value), m.lost, Number(m.lost_value)]);
  q.columns.forEach((c, i) => { c.width = i === 0 ? 10 : 15; if ([2, 4, 6].includes(i)) c.numFmt = "#,##0"; });

  const c = wb.addWorksheet("Kundkategorier");
  header(c.addRow(["Kategori", "Vunna offerter", "Värde exkl. moms (kr)"]));
  for (const x of s.by_category) c.addRow([x.category, x.count, Number(x.value)]);
  c.getColumn(1).width = 24; c.getColumn(2).width = 16; c.getColumn(3).width = 22; c.getColumn(3).numFmt = "#,##0";

  const ty = wb.addWorksheet("Evenemangstyper");
  header(ty.addRow(["Typ", "Evenemang", "Vunnet värde (kr)", "Snitt per evenemang (kr)"]));
  for (const x of s.by_type) ty.addRow([x.type, x.events, Number(x.value), Number(x.avg)]);
  ty.getColumn(1).width = 24; ty.getColumn(2).width = 12; ty.getColumn(3).width = 20; ty.getColumn(4).width = 24;
  ty.getColumn(3).numFmt = "#,##0"; ty.getColumn(4).numFmt = "#,##0";

  return Buffer.from(await wb.xlsx.writeBuffer());
}

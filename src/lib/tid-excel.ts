import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtTime, isoToDate } from "@/lib/datum";
import { ATTEST_LABEL, KIND_LABEL, monthLabel } from "@/lib/personal";
import { loadMonth } from "@/lib/tid";
import { obHours, parseObSettings } from "@/lib/lon";

/** Tidsunderlag för en månad som Excel: summering per person och alla pass. */
export async function buildMonthWorkbook(supabase: SupabaseClient, month: string) {
  const { rows, period } = await loadMonth(supabase, month);

  const wb = new ExcelJS.Workbook();
  wb.creator = "FCC Bokning";
  wb.created = new Date();
  const brand = "FF60272B";

  const sum = wb.addWorksheet("Summering", { views: [{ state: "frozen", ySplit: 3 }] });
  sum.addRow([`Tidsunderlag ${monthLabel(month)}`]).font = { bold: true, size: 14 };
  sum.addRow([period?.locked_at ? `Låst ${isoToDate(period.locked_at)}` : "Ej låst – preliminärt underlag"]);
  const head = sum.addRow(["Namn", "Typ", "Företag", "Pass", "Attesterade timmar", "Belopp (kr)", "Ej attesterade pass"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } }));
  const people = new Map<string, typeof rows>();
  for (const r of rows) people.set(r.staff_id, [...(people.get(r.staff_id) ?? []), r]);
  for (const list of people.values()) {
    const ok = list.filter((r) => r.attest_status === "attesterad");
    sum.addRow([
      list[0].staff.name,
      KIND_LABEL[list[0].staff.kind],
      list[0].staff.company ?? "",
      list.length,
      ok.reduce((s, r) => s + (r.hours ?? 0), 0),
      ok.reduce((s, r) => s + (r.amount ?? 0), 0),
      list.length - ok.length,
    ]);
  }
  sum.getColumn(1).width = 28;
  sum.getColumn(2).width = 12;
  sum.getColumn(3).width = 24;
  sum.getColumn(5).numFmt = "0.00";
  sum.getColumn(5).width = 18;
  sum.getColumn(6).numFmt = "#,##0.00";
  sum.getColumn(6).width = 14;
  sum.getColumn(7).width = 18;

  const det = wb.addWorksheet("Pass", { views: [{ state: "frozen", ySplit: 1 }] });
  det.columns = [
    { header: "Namn", key: "name", width: 26 },
    { header: "Typ", key: "kind", width: 10 },
    { header: "Datum", key: "date", width: 12 },
    { header: "Funktion", key: "fn", width: 16 },
    { header: "Evenemang", key: "event", width: 30 },
    { header: "Planerat", key: "planned", width: 13 },
    { header: "Start", key: "start", width: 8 },
    { header: "Slut", key: "end", width: 8 },
    { header: "Rast (min)", key: "brk", width: 10 },
    { header: "Timmar", key: "hours", width: 9, style: { numFmt: "0.00" } },
    { header: "Timpris", key: "rate", width: 10, style: { numFmt: "#,##0.00" } },
    { header: "Belopp", key: "amount", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Status", key: "status", width: 14 },
    { header: "Attesterad av", key: "by", width: 20 },
    { header: "Kommentar", key: "comment", width: 40 },
  ];
  det.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  det.getRow(1).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand } }));
  for (const r of rows) {
    det.addRow({
      name: r.staff.name,
      kind: KIND_LABEL[r.staff.kind],
      date: isoToDate(r.shifts.starts_at),
      fn: r.fn?.name ?? "",
      event: r.shifts.events?.title ?? r.shifts.title ?? "",
      planned: `${fmtTime(r.shifts.starts_at)}–${fmtTime(r.shifts.ends_at)}`,
      start: r.actual_start ? fmtTime(r.actual_start) : "",
      end: r.actual_end ? fmtTime(r.actual_end) : "",
      brk: r.actual_start ? r.break_minutes : "",
      hours: r.hours ?? "",
      rate: r.rate,
      amount: r.amount ?? "",
      status: ATTEST_LABEL[r.attest_status],
      by: r.attestedByName ?? "",
      comment: [r.report_comment, r.attest_comment].filter(Boolean).join(" / "),
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const ok = rows.filter((r) => r.attest_status === "attesterad");
  return {
    buffer: Buffer.from(buf as ArrayBuffer),
    locked: !!period?.locked_at,
    summary: { shifts: ok.length, hours: ok.reduce((x, r) => x + (r.hours ?? 0), 0), amount: ok.reduce((x, r) => x + (r.amount ?? 0), 0) },
  };
}

const HEADERS = ["Namn", "Företag", "Anställningsnr", "Datum", "Löneart", "Löneart titel", "Projekt (Lön)", "Kostnadsställe", "Kostnadsbärare", "Timmar", "Antal", "Enhet", "Pris", "Summa"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Löneunderlag i samma format som lönesystemets import (som exporten från ShowWizrd):
 * ett blad "1", gul fetstil rubrikrad, en rad Timlön per person och en rad per OB-löneart.
 * Bara attesterade pass för anställda (interna, och frilansare utan eget företag).
 */
export async function buildPayrollWorkbook(supabase: SupabaseClient, month: string) {
  const [{ rows, period }, { data: setting }] = await Promise.all([
    loadMonth(supabase, month),
    supabase.from("app_settings").select("value").eq("key", "payroll_ob").maybeSingle(),
  ]);
  const ob = parseObSettings(setting?.value);

  type Sum = { name: string; empNo: string; hours: number; evening: number; night: number; weekend: number };
  const people = new Map<string, Sum>();
  for (const r of rows) {
    if (r.attest_status !== "attesterad" || r.hours == null || !r.actual_start || !r.actual_end) continue;
    if (r.staff.kind === "leverantor" || (r.staff.kind === "frilans" && r.staff.company)) continue;
    const p = people.get(r.staff_id) ?? { name: r.staff.name, empNo: r.staff.employment_number ?? "", hours: 0, evening: 0, night: 0, weekend: 0 };
    const o = obHours(r.actual_start, r.actual_end, r.break_minutes, ob);
    p.hours += r.hours;
    p.evening += o.evening;
    p.night += o.night;
    p.weekend += o.weekend;
    people.set(r.staff_id, p);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "FCC Bokning";
  wb.created = new Date();
  const ws = wb.addWorksheet("1");
  ws.properties.defaultColWidth = 15;
  const head = ws.addRow(HEADERS);
  head.eachCell((c) => {
    c.font = { name: "Calibri", size: 11, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  });

  const line = (p: Sum, code: string, title: string, hours: number) => {
    const h = r2(hours);
    const row = ws.addRow([p.name, "", p.empNo || null, "", code || null, title, null, null, null, h, h, "t", null, null, ""]);
    row.getCell(4).numFmt = "yyyy-mm-dd";
  };
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  for (const p of list) {
    line(p, "", ob.hourlyTitle, p.hours);
    if (r2(p.evening) > 0) line(p, ob.evening.code, ob.evening.title, p.evening);
    if (r2(p.night) > 0) line(p, ob.night.code, ob.night.title, p.night);
    if (r2(p.weekend) > 0) line(p, ob.weekend.code, ob.weekend.title, p.weekend);
  }

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buf as ArrayBuffer), locked: !!period?.locked_at, people: list.length };
}

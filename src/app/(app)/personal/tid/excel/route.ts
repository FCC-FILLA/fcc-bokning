import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { canManageStaff, getProfile } from "@/lib/auth";
import { fmtTime, isoToDate } from "@/lib/datum";
import { KIND_LABEL, ATTEST_LABEL, monthLabel } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";
import { loadMonth } from "@/lib/tid";

export const runtime = "nodejs";

// Tidsunderlag för en månad som Excel: en flik med alla pass och en summering per person.
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!canManageStaff(profile)) return new NextResponse("Ingen behörighet.", { status: 403 });
  const month = new URL(req.url).searchParams.get("manad") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Ange månad.", { status: 400 });
  const supabase = await createClient();
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

  if (period?.locked_at) await supabase.from("time_periods").update({ exported_at: new Date().toISOString() }).eq("month", `${month}-01`);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Tidsunderlag-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

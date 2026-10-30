import { addDays, localToIso } from "@/lib/datum";

/** Läser formuläret: hela dagar om klockslag saknas, annars från dag+tid till dag+tid. */
export function readUnavailability(fd: FormData): { from: string; to: string; note: string } | null {
  const fromDate = String(fd.get("from_date") ?? "");
  const toDate = String(fd.get("to_date") ?? "") || fromDate;
  const ft = String(fd.get("from_time") ?? "");
  const tt = String(fd.get("to_time") ?? "");
  const D = /^\d{4}-\d{2}-\d{2}$/, T = /^\d{2}:\d{2}$/;
  if (!D.test(fromDate) || !D.test(toDate)) return null;
  const from = localToIso(`${fromDate}T${T.test(ft) ? ft : "00:00"}`);
  const to = T.test(tt) ? localToIso(`${toDate}T${tt}`) : localToIso(`${addDays(toDate, 1)}T00:00`);
  if (to <= from) return null;
  return { from, to, note: String(fd.get("note") ?? "").slice(0, 200) };
}

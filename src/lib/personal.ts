// Personal: funktioner, personer, pass och tilldelningar.

export type StaffKind = "intern" | "frilans" | "leverantor";
export type ShiftStatus = "utkast" | "oppen" | "stangd";
export type AssignmentStatus = "ansokt" | "tilldelad" | "nekad" | "aterkallad" | "inbjuden" | "avbojd" | "utgangen";

export const KIND_LABEL: Record<StaffKind, string> = { intern: "Intern", frilans: "Frilans", leverantor: "Leverantör" };
export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = { utkast: "Utkast", oppen: "Öppen för ansökan", stangd: "Stängd" };
export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  ansokt: "Har sökt",
  tilldelad: "Tilldelad",
  nekad: "Nekad",
  aterkallad: "Återkallad",
  inbjuden: "Inbjuden",
  avbojd: "Tackade nej",
  utgangen: "Svarade inte",
};

export type StaffFunction = { id: string; name: string; color: string; hourly_rate: number; active: boolean; sort_order: number };
export type Staff = {
  id: string;
  kind: StaffKind;
  profile_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  hourly_rate: number | null;
  active: boolean;
  note: string | null;
  link_token: string;
};
export type Shift = {
  id: string;
  event_id: string | null;
  room_id: string | null;
  function_id: string;
  staff_kind: StaffKind;
  supplier_id: string | null;
  starts_at: string;
  ends_at: string;
  needed: number;
  status: ShiftStatus;
  title: string | null;
  note: string | null;
  hourly_rate: number | null;
};
export type Assignment = { id: string; shift_id: string; staff_id: string; status: AssignmentStatus; applied_at: string; decided_at: string | null };

/** Timmar för ett pass, med två decimaler. */
export const shiftHours = (s: { starts_at: string; ends_at: string }) =>
  Math.round(((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000) * 100) / 100;

/** Timpris: passets, annars personens, annars funktionens. */
export const rateFor = (shift: Pick<Shift, "hourly_rate">, staff: Pick<Staff, "hourly_rate"> | null, fn: Pick<StaffFunction, "hourly_rate"> | undefined) =>
  Number(shift.hourly_rate ?? staff?.hourly_rate ?? fn?.hourly_rate ?? 0);

/** Bemanning per funktion: "Garderob 8/10". */
export function staffingSummary(shifts: Pick<Shift, "id" | "function_id" | "needed">[], assignments: Pick<Assignment, "shift_id" | "status">[], fns: StaffFunction[]) {
  const filled = new Map<string, number>();
  for (const a of assignments) if (a.status === "tilldelad") filled.set(a.shift_id, (filled.get(a.shift_id) ?? 0) + 1);
  const out = new Map<string, { fn: StaffFunction; needed: number; filled: number }>();
  for (const s of shifts) {
    const fn = fns.find((f) => f.id === s.function_id);
    if (!fn) continue;
    const cur = out.get(fn.id) ?? { fn, needed: 0, filled: 0 };
    cur.needed += s.needed;
    cur.filled += Math.min(filled.get(s.id) ?? 0, s.needed);
    out.set(fn.id, cur);
  }
  return [...out.values()].sort((a, b) => a.fn.sort_order - b.fn.sort_order);
}

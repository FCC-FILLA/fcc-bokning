import type { SupabaseClient } from "@supabase/supabase-js";
import { dayStartIso } from "@/lib/datum";
import { monthRange, rateFor, workedHours, type AttestStatus, type Shift, type Staff, type StaffFunction } from "@/lib/personal";

export type TimeRow = {
  id: string;
  staff_id: string;
  status: string;
  actual_start: string | null;
  actual_end: string | null;
  break_minutes: number;
  report_comment: string | null;
  reported_at: string | null;
  attest_status: AttestStatus;
  attest_comment: string | null;
  attested_by: string | null;
  attested_at: string | null;
  shifts: Pick<Shift, "id" | "starts_at" | "ends_at" | "function_id" | "hourly_rate" | "title"> & { events: { title: string } | null };
  staff: Pick<Staff, "id" | "name" | "kind" | "hourly_rate" | "profile_id" | "company"> & { employment_number: string | null };
};

/** Alla tilldelade pass som börjar en viss månad, med tidrapport. */
export async function loadMonth(supabase: SupabaseClient, month: string) {
  const { first, next } = monthRange(month);
  const [{ data }, { data: fns }, { data: period }, { data: profiles }] = await Promise.all([
    supabase
      .from("shift_assignments")
      .select(
        "id, staff_id, status, actual_start, actual_end, break_minutes, report_comment, reported_at, attest_status, attest_comment, attested_by, attested_at, shifts!inner(id, starts_at, ends_at, function_id, hourly_rate, title, events(title)), staff!inner(id, name, kind, hourly_rate, profile_id, company, employment_number)",
      )
      .eq("status", "tilldelad")
      .gte("shifts.starts_at", dayStartIso(first))
      .lt("shifts.starts_at", dayStartIso(next)),
    supabase.from("staff_functions").select("*"),
    supabase.from("time_periods").select("*").eq("month", first).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const rows = ((data ?? []) as unknown as TimeRow[]).sort(
    (a, b) => a.staff.name.localeCompare(b.staff.name, "sv") || a.shifts.starts_at.localeCompare(b.shifts.starts_at),
  );
  const functions = ((fns ?? []) as StaffFunction[]).map((f) => ({ ...f, hourly_rate: Number(f.hourly_rate) }));
  const fnById = new Map(functions.map((f) => [f.id, f]));
  const who = new Map(((profiles ?? []) as { id: string; full_name: string; email: string | null }[]).map((p) => [p.id, p.full_name || p.email || ""]));
  const enriched = rows.map((r) => {
    const hours = workedHours(r);
    const rate = rateFor(r.shifts, r.staff, fnById.get(r.shifts.function_id));
    return { ...r, hours, rate, amount: hours != null ? Math.round(hours * rate * 100) / 100 : null, fn: fnById.get(r.shifts.function_id), attestedByName: r.attested_by ? who.get(r.attested_by) : null };
  });
  return {
    rows: enriched,
    period: period as { month: string; locked_at: string | null; locked_by: string | null; exported_at: string | null } | null,
    lockedByName: period?.locked_by ? who.get(period.locked_by) : null,
  };
}

export type MonthRow = Awaited<ReturnType<typeof loadMonth>>["rows"][number];

import { cache } from "react";
import { fmtDayMonth, isoToDate } from "@/lib/datum";
import type { Staff, StaffFunction } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";

/** Listor som passformulären behöver. */
export const getStaffLookups = cache(async () => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [fns, evs, rooms, suppliers] = await Promise.all([
    supabase.from("staff_functions").select("*").order("sort_order"),
    supabase.from("event_overview").select("id, title, starts_at, status").gte("ends_at", since).neq("status", "avbokad").order("starts_at").limit(300),
    supabase.from("rooms").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("staff").select("id, name, company").eq("kind", "leverantor").eq("active", true).order("name"),
  ]);
  return {
    functions: ((fns.data ?? []) as StaffFunction[]).map((f) => ({ ...f, hourly_rate: Number(f.hourly_rate) })),
    events: ((evs.data ?? []) as { id: string; title: string; starts_at: string | null }[]).map((e) => ({
      id: e.id,
      name: e.title,
      when: e.starts_at ? fmtDayMonth(isoToDate(e.starts_at)) : undefined,
    })),
    rooms: (rooms.data ?? []) as { id: string; name: string }[],
    suppliers: ((suppliers.data ?? []) as Pick<Staff, "id" | "name" | "company">[]).map((s) => ({ id: s.id, name: s.company ? `${s.company} (${s.name})` : s.name })),
  };
});

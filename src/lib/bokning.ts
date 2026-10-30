import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isoToDate, isoToLocal, localToIso } from "@/lib/datum";

export type BookingInputRow = {
  room_id: string;
  date: string; // YYYY-MM-DD, svensk tid
  from: string; // HH:MM
  to: string; // HH:MM, före eller lika med "from" betyder nästa dag
  setup_id?: string | null;
  note?: string | null;
  rig_minutes?: number;
  strike_minutes?: number;
};

/** Minuter i rimligt intervall (0–48 h), annars 0. */
export const minutes = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(2880, n) : 0;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Läser och kontrollerar rader från formuläret (JSON). Ogiltiga rader ger ett felmeddelande. */
export function parseRows(json: string | null): { rows: BookingInputRow[]; error: string | null } {
  if (!json) return { rows: [], error: null };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { rows: [], error: "Bokningsraderna kunde inte läsas." };
  }
  if (!Array.isArray(data)) return { rows: [], error: "Bokningsraderna kunde inte läsas." };
  const rows: BookingInputRow[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const row = {
      room_id: String(r.room_id ?? ""),
      date: String(r.date ?? ""),
      from: String(r.from ?? ""),
      to: String(r.to ?? ""),
      setup_id: r.setup_id ? String(r.setup_id) : null,
      note: r.note ? String(r.note).trim().slice(0, 500) || null : null,
      rig_minutes: minutes(r.rig_minutes),
      strike_minutes: minutes(r.strike_minutes),
    };
    if (!UUID.test(row.room_id) || !DATE.test(row.date) || !TIME.test(row.from) || !TIME.test(row.to)) {
      return { rows: [], error: "Varje rad behöver lokal, datum, starttid och sluttid." };
    }
    rows.push(row);
  }
  return { rows, error: null };
}

/** Gör om rader till bokningar i databasformat, upprepade varje vecka. */
export function expandRows(rows: BookingInputRow[], repeatWeeks: number, eventId: string) {
  const weeks = Math.min(52, Math.max(1, Math.floor(repeatWeeks) || 1));
  const out = [];
  for (let w = 0; w < weeks; w++) {
    for (const r of rows) {
      const d = addDays(r.date, w * 7);
      const endDate = r.to <= r.from ? addDays(d, 1) : d;
      out.push({
        event_id: eventId,
        room_id: r.room_id,
        starts_at: localToIso(`${d}T${r.from}`),
        ends_at: localToIso(`${endDate}T${r.to}`),
        setup_id: r.setup_id || null,
        note: r.note || null,
        rig_minutes: r.rig_minutes ?? 0,
        strike_minutes: r.strike_minutes ?? 0,
      });
    }
  }
  return out;
}

/** Flyttar en tidpunkt ett antal kalenderdagar men behåller klockslaget i svensk tid. */
export function shiftIso(iso: string, days: number) {
  const local = isoToLocal(iso);
  return localToIso(`${addDays(local.slice(0, 10), days)}T${local.slice(11)}`);
}

/** Antal kalenderdagar mellan två datum (YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 864e5);
}

export { isoToDate };

/** "1:a", "2:a", "3:e" … för optionskön. */
export const optionOrdinal = (n: number) => `${n}:${n === 1 || n === 2 ? "a" : "e"}`;

/** Plats i optionskön för obekräftade evenemang som delar lokal och tid med andra. */
export async function loadOptionPlaces(supabase: SupabaseClient, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, number>();
  const { data } = await supabase.from("option_places").select("event_id, place").eq("shared", true).in("event_id", [...new Set(eventIds)]);
  return new Map(((data ?? []) as { event_id: string; place: number }[]).map((x) => [x.event_id, x.place]));
}

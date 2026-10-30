import { addDays, dayShort, fmtDayMonth, isoToDate, isoToLocal, localToIso } from "@/lib/datum";

export const PHASES = ["bygg", "genomforande", "riv"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = { bygg: "Bygg", genomforande: "Genomförande", riv: "Riv" };
export const isPhase = (v: unknown): v is Phase => typeof v === "string" && (PHASES as readonly string[]).includes(v);

export type SeriesBooking = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  setup_id: string | null;
  note: string | null;
  phase?: string | null;
};

/** En serie = samma lokal, fas, möblering, notering och klockslag, på en eller flera dagar. */
export type Series = {
  key: string;
  room_id: string;
  phase: Phase;
  setup_id: string | null;
  note: string | null;
  from: string; // HH:MM
  to: string; // HH:MM
  spanDays: number; // 0 = slutar samma dag
  dates: string[];
  ids: string[];
};

const hhmm = (iso: string) => isoToLocal(iso).slice(11, 16);
const phaseOf = (b: SeriesBooking): Phase => (isPhase(b.phase) ? b.phase : "genomforande");

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Slår ihop bokningar som bara skiljer sig i datum till serier, sorterade efter första datum och lokal. */
export function groupSeries(bookings: SeriesBooking[]): Series[] {
  const map = new Map<string, Series>();
  for (const b of [...bookings].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    const d = isoToDate(b.starts_at);
    const from = hhmm(b.starts_at);
    const to = hhmm(b.ends_at);
    const spanDays = dayDiff(d, isoToDate(b.ends_at));
    const phase = phaseOf(b);
    const key = [b.room_id, phase, b.setup_id ?? "", (b.note ?? "").trim(), from, to, spanDays].join("|");
    const s = map.get(key);
    if (s) {
      if (!s.dates.includes(d)) s.dates.push(d);
      s.ids.push(b.id);
    } else {
      map.set(key, { key, room_id: b.room_id, phase, setup_id: b.setup_id, note: b.note?.trim() || null, from, to, spanDays, dates: [d], ids: [b.id] });
    }
  }
  return [...map.values()];
}

/** "tor 11–lör 13 mar, tor 18 mar" – sammanhängande dagar skrivs som intervall. */
export function describeDates(dates: string[]): string {
  const sorted = [...new Set(dates)].sort();
  const runs: [string, string][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d;
    else runs.push([d, d]);
  }
  const one = (d: string) => `${dayShort(d).toLowerCase()} ${fmtDayMonth(d)}`;
  return runs
    .map(([a, b]) => {
      if (a === b) return one(a);
      const sameMonth = a.slice(0, 7) === b.slice(0, 7);
      const left = sameMonth ? `${dayShort(a).toLowerCase()} ${Number(a.slice(8))}` : one(a);
      return `${left}–${one(b)}`;
    })
    .join(", ");
}

/** Nya tider för en bokning när seriens klockslag ändras. Datumet behålls; sluttid före eller lika med start betyder nästa dag. */
export function retime(startsAt: string, from: string, to: string): { starts_at: string; ends_at: string } {
  const d = isoToDate(startsAt);
  return {
    starts_at: localToIso(`${d}T${from}`),
    ends_at: localToIso(`${to <= from ? addDays(d, 1) : d}T${to}`),
  };
}

/** Flyttar en tidpunkt ett antal minuter. */
export const shiftMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

export type MatrixRoom = { id: string; parent_id: string | null; name: string; sort_order: number };
export type MatrixGroup = { label: string | null; rooms: MatrixRoom[] };

/**
 * Lokaler som har bokningar, i lokalernas ordning. Delbara lokaler (t.ex. Rörstrandssalarna med Rörstrand 1–7)
 * blir en grupp med rubrik; fristående lokaler (Stora salen, Birka …) står var för sig utan rubrik.
 */
export function matrixGroups(rooms: MatrixRoom[], usedRoomIds: Set<string>): MatrixGroup[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const rootOf = (r: MatrixRoom) => {
    let cur = r;
    for (let i = 0; i < 10 && cur.parent_id && byId.has(cur.parent_id); i++) cur = byId.get(cur.parent_id)!;
    return cur;
  };
  const hasChildren = new Set(rooms.filter((r) => r.parent_id).map((r) => r.parent_id!));
  const groups = new Map<string, { label: string | null; order: number; rooms: MatrixRoom[] }>();
  for (const r of rooms.filter((x) => usedRoomIds.has(x.id)).sort((a, b) => a.sort_order - b.sort_order)) {
    const root = rootOf(r);
    const g = groups.get(root.id) ?? { label: hasChildren.has(root.id) ? root.name : null, order: root.sort_order, rooms: [] };
    g.rooms.push(r);
    groups.set(root.id, g);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order).map(({ label, rooms }) => ({ label, rooms }));
}

/** Delar upp dagar i block om högst `size` kolumner, så att matrisen får plats på skärmen. */
export function chunkDays(dates: string[], size = 7): string[][] {
  const sorted = [...new Set(dates)].sort();
  const out: string[][] = [];
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

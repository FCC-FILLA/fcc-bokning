import { addDays, isoToDate, isoToLocal } from "@/lib/datum";

// Kontorsskärmen: data från screen_feed() och uträkningarna som sidan visar.

export type ScreenBooking = { room: string; start: string; end: string; setup: string | null; phase?: "bygg" | "genomforande" | "riv" };
export type ScreenShift = { function: string; color: string; start: string; end: string; needed: number; assigned: number };
export type ScreenEvent = {
  id: string;
  title: string;
  status: "preliminar" | "bekraftad" | "genomford";
  type: string | null;
  color: string | null;
  company: string | null;
  participants: number | null;
  responsible: string | null;
  staff_info: string | null;
  start: string;
  end: string;
  bookings: ScreenBooking[];
  shifts: ScreenShift[];
};
export type ScreenRoom = { name: string; parent: string | null };
export type ScreenFeed = { now: string; rooms: ScreenRoom[]; events: ScreenEvent[] };

const t = (iso: string) => new Date(iso).getTime();

/** Bokningar som rör ett visst datum: startar den dagen, eller pågår över midnatt in i den. */
export function bookingsOn(e: ScreenEvent, date: string): ScreenBooking[] {
  return e.bookings.filter(
    (b) =>
      isoToDate(b.start) === date ||
      (isoToDate(b.start) < date && isoToDate(b.end) >= date && isoToLocal(b.end) !== `${date}T00:00`),
  );
}

export type DaySpan = { event: ScreenEvent; start: string; end: string; bookings: ScreenBooking[] };

/** Evenemangen ett visst datum, med första start och sista slut just den dagen. */
export function eventsOn(events: ScreenEvent[], date: string): DaySpan[] {
  return events
    .map((event) => {
      const bookings = bookingsOn(event, date);
      if (!bookings.length) return null;
      const start = bookings.reduce((m, b) => (t(b.start) < t(m) ? b.start : m), bookings[0].start);
      const end = bookings.reduce((m, b) => (t(b.end) > t(m) ? b.end : m), bookings[0].end);
      return { event, start, end, bookings };
    })
    .filter((x): x is DaySpan => x !== null)
    .sort((a, b) => t(a.start) - t(b.start));
}

/** De sju dagarna efter idag, som datumsträngar. */
export function nextDays(today: string, n = 7): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i + 1));
}

/** Pass för en dag: bemannade av behövda, och om något pass saknar folk. */
export function staffing(spans: DaySpan[], date: string) {
  const shifts = spans.flatMap((s) => s.event.shifts.filter((x) => isoToDate(x.start) === date));
  const needed = shifts.reduce((n, s) => n + s.needed, 0);
  const assigned = shifts.reduce((n, s) => n + Math.min(s.assigned, s.needed), 0);
  return { needed, assigned };
}

/**
 * Rummen som visas i rumsremsan: alla lokaler utom de som är delade i mindre delar
 * (t.ex. Rörstrandssalarna, där delarna 1–7 visas i stället).
 */
export function stripRooms(rooms: ScreenRoom[]): string[] {
  const parents = new Set(rooms.map((r) => r.parent).filter(Boolean));
  return rooms.filter((r) => !parents.has(r.name)).map((r) => r.name);
}

export type RoomState = { room: string; kind: "free" | "next" | "live" | "done"; title?: string; start?: string; end?: string };

/** Läget i varje rum idag. En bokning på en hel sal räknas på alla dess delar, och en delbokning på salen den hör till. */
export function roomStates(rooms: ScreenRoom[], spans: DaySpan[], now: Date): RoomState[] {
  const parentOf = new Map(rooms.map((r) => [r.name, r.parent]));
  const childrenOf = new Map<string, string[]>();
  for (const r of rooms) if (r.parent) childrenOf.set(r.parent, [...(childrenOf.get(r.parent) ?? []), r.name]);

  const shown = stripRooms(rooms);
  const hits = new Map<string, { title: string; start: string; end: string }[]>();
  const add = (room: string, x: { title: string; start: string; end: string }) => hits.set(room, [...(hits.get(room) ?? []), x]);
  for (const s of spans) {
    for (const b of s.bookings) {
      const x = { title: s.event.title, start: b.start, end: b.end };
      add(b.room, x);
      for (const c of childrenOf.get(b.room) ?? []) add(c, x);
      const p = parentOf.get(b.room);
      if (p) add(p, x);
    }
  }

  const n = now.getTime();
  return shown.map((room) => {
    const list = (hits.get(room) ?? []).sort((a, b) => t(a.start) - t(b.start));
    const live = list.find((x) => t(x.start) <= n && n < t(x.end));
    if (live) return { room, kind: "live", ...live };
    const next = list.find((x) => t(x.start) > n);
    if (next) return { room, kind: "next", ...next };
    return { room, kind: list.length ? "done" : "free" };
  });
}

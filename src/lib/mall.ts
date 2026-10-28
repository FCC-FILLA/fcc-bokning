import { addDays, isoToDate, isoToLocal, localToIso } from "@/lib/datum";
import { daysBetween } from "@/lib/bokning";

export type TemplateBooking = {
  day_offset: number;
  room_id: string;
  start_time: string; // "HH:MM" eller "HH:MM:SS"
  end_time: string;
  setup_id: string | null;
  note: string | null;
};

/** Mallens lokaler och tider blir riktiga bokningar från ett startdatum (dag 1 = startdatumet). */
export function bookingsFromTemplate(rows: TemplateBooking[], startDate: string, eventId: string) {
  return rows.map((r) => {
    const from = r.start_time.slice(0, 5);
    const to = r.end_time.slice(0, 5);
    const d = addDays(startDate, r.day_offset);
    return {
      event_id: eventId,
      room_id: r.room_id,
      starts_at: localToIso(`${d}T${from}`),
      ends_at: localToIso(`${to <= from ? addDays(d, 1) : d}T${to}`),
      setup_id: r.setup_id,
      note: r.note,
    };
  });
}

/** Ett evenemangs bokningar blir mallrader, räknat i dagar från första bokningen. */
export function templateFromBookings(
  bookings: { room_id: string; starts_at: string; ends_at: string; setup_id: string | null; note: string | null }[],
): TemplateBooking[] {
  if (!bookings.length) return [];
  const first = isoToDate([...bookings].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0].starts_at);
  return bookings.map((b) => ({
    day_offset: daysBetween(first, isoToDate(b.starts_at)),
    room_id: b.room_id,
    start_time: isoToLocal(b.starts_at).slice(11),
    end_time: isoToLocal(b.ends_at).slice(11),
    setup_id: b.setup_id,
    note: b.note,
  }));
}

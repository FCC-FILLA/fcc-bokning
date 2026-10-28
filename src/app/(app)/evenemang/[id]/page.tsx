import Link from "next/link";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { fmtDate, fmtRange } from "@/lib/datum";
import { getLookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import type { Booking, BookingConflict, EventRow } from "@/lib/types";
import { BookingFields } from "@/components/booking-fields";
import { ConfirmButton } from "@/components/confirm-button";
import { EventFields } from "@/components/event-fields";
import { StatusPill } from "@/components/status-pill";
import { addBookings, deleteBooking, deleteEvent, updateEvent } from "../actions";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; tillagt?: string; tidigare?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const booker = canBook(profile);
  const supabase = await createClient();

  const [{ data: event }, { data: bookingData }, { data: conflictData }, lookups] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase.from("bookings").select("*").eq("event_id", id).order("starts_at"),
    supabase.from("booking_conflicts").select("*").eq("event_id", id),
    getLookups(),
  ]);
  if (!event) notFound();
  const ev = event as EventRow;

  const now = new Date().toISOString();
  const allBookings = (bookingData ?? []) as Booking[];
  const showPast = sp.tidigare === "1";
  const pastCount = allBookings.filter((b) => b.ends_at < now).length;
  const bookings = showPast ? allBookings : allBookings.filter((b) => b.ends_at >= now);

  const conflicts = (conflictData ?? []) as BookingConflict[];
  const conflictsFor = (bookingId: string) => conflicts.filter((c) => c.booking_id === bookingId);
  const upcomingConflicts = conflicts.filter((c) => c.ends_at >= now);

  const roomName = new Map(lookups.rooms.map((r) => [r.id, r.name]));
  const setupName = new Map(lookups.setups.map((s) => [s.id, s.name]));
  const capacity = (roomId: string, setupId: string | null) =>
    setupId ? lookups.capacities.find((c) => c.room_id === roomId && c.setup_id === setupId)?.capacity : undefined;
  const company = lookups.companies.find((c) => c.id === ev.company_id);

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-2">
        <Link href="/evenemang" className="text-sm text-muted hover:underline">← Evenemang</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{ev.title}</h1>
          <StatusPill status={ev.status} />
          {company && (
            <Link className="text-sm text-muted hover:underline" href={`/kunder/${company.id}`}>{company.name}</Link>
          )}
        </div>
        {ev.status === "preliminar" && ev.option_expires_on && (
          <p className="text-sm text-st-preliminar">Optionen gäller till {fmtDate(ev.option_expires_on)}.</p>
        )}
      </div>

      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Evenemanget är sparat.</p>}
      {sp.tillagt && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.tillagt} bokning(ar) har lagts till.</p>}
      {upcomingConflicts.length > 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          {upcomingConflicts.length} kommande bokning(ar) krockar med andra evenemang. Se markeringarna under Bokningar.
        </p>
      )}

      {/* Bokningar */}
      <section id="bokningar" className="card p-5 grid gap-4 scroll-mt-20">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">Bokningar</h2>
          <span className="text-sm text-muted">{allBookings.length} totalt</span>
          <span className="flex-1" />
          {pastCount > 0 && (
            <Link className="text-sm text-muted underline-offset-2 hover:underline" href={`/evenemang/${id}${showPast ? "" : "?tidigare=1"}#bokningar`}>
              {showPast ? "Dölj tidigare" : `Visa tidigare (${pastCount})`}
            </Link>
          )}
        </div>

        {bookings.length === 0 ? (
          <p className="text-sm text-muted">Inga {pastCount ? "kommande " : ""}bokningar. Lägg till lokal och tid nedan.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="table min-w-[720px]">
              <thead>
                <tr>
                  <th className="pl-5">Tid</th>
                  <th>Lokal</th>
                  <th>Möblering</th>
                  <th>Notering</th>
                  <th className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const cs = conflictsFor(b.id);
                  const cap = capacity(b.room_id, b.setup_id);
                  const over = cap != null && ev.participants != null && ev.participants > cap;
                  return (
                    <tr key={b.id} className={cs.length ? "bg-warn-soft/60" : ""}>
                      <td className="pl-5 whitespace-nowrap text-sm">{fmtRange(b.starts_at, b.ends_at)}</td>
                      <td>
                        <span className="font-semibold">{roomName.get(b.room_id) ?? "Okänd lokal"}</span>
                        {cs.map((c) => (
                          <span key={c.other_booking_id} className="block text-xs text-warn">
                            Krockar med{" "}
                            <Link className="underline" href={`/evenemang/${c.other_event_id}`}>{c.other_event_title}</Link>{" "}
                            i {c.other_room_name}, {fmtRange(c.other_starts_at, c.other_ends_at)}
                          </span>
                        ))}
                      </td>
                      <td className="text-sm">
                        {b.setup_id ? setupName.get(b.setup_id) : <span className="text-muted">–</span>}
                        {cap != null && <span className={`block text-xs ${over ? "text-warn" : "text-muted"}`}>max {cap}{over ? `, ${ev.participants} deltagare` : ""}</span>}
                      </td>
                      <td className="text-sm">{b.note ?? <span className="text-muted">–</span>}</td>
                      <td className="pr-5 text-right">
                        {booker && (
                          <form action={deleteBooking.bind(null, id, b.id)}>
                            <ConfirmButton label="Ta bort" question="Ta bort bokningen?" confirmLabel="Ta bort" className="btn btn-ghost text-sm text-warn" />
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {booker && (
          <details className="rounded-lg border border-line p-4" open={allBookings.length === 0}>
            <summary className="cursor-pointer font-semibold">Lägg till bokning</summary>
            <form action={addBookings.bind(null, id)} className="mt-4 grid gap-4">
              <BookingFields lookups={lookups} />
              <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
            </form>
          </details>
        )}
      </section>

      {/* Uppgifter */}
      <form action={updateEvent.bind(null, id)} className="card p-5 grid gap-4">
        <h2 className="text-lg font-semibold">Uppgifter</h2>
        <EventFields event={ev} lookups={lookups} disabled={!booker} />
        {booker && (
          <div>
            <button className="btn btn-primary" type="submit">Spara ändringar</button>
          </div>
        )}
      </form>

      {booker && (
        <form action={deleteEvent.bind(null, id)} className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>Vill du hellre behålla historiken, sätt status till Avbokad i stället.</span>
          <ConfirmButton
            label="Ta bort evenemanget"
            question="Evenemanget och alla dess bokningar tas bort för gott."
            confirmLabel="Ta bort"
          />
        </form>
      )}
    </div>
  );
}

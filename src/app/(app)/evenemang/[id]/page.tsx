import Link from "next/link";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { addDays, dayLong, fmtDate, fmtDayMonth, fmtRange, fmtTime, isoToDate, isoToLocal } from "@/lib/datum";
import { daysBetween } from "@/lib/bokning";
import { depthOf } from "@/lib/lokaler";
import { getLookups } from "@/lib/lookups";
import { QUOTE_STATUS_LABEL, fmtKr, type QuoteStatus } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import type { Booking, BookingConflict, EventRow } from "@/lib/types";
import { BookingFields } from "@/components/booking-fields";
import { ConfirmButton } from "@/components/confirm-button";
import { EventFields } from "@/components/event-fields";
import { StatusPill } from "@/components/status-pill";
import {
  addBookings, copyDay, deleteBooking, deleteEvent, duplicateEvent, updateBooking, updateEvent,
} from "../actions";

type QuoteRow = { id: string; number: number; title: string; status: QuoteStatus; total_ex_vat: number; accepted_name: string | null };

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; tillagt?: string; tidigare?: string; andrat?: string; kopierad?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const booker = canBook(profile);
  const supabase = await createClient();

  const [{ data: event }, { data: bookingData }, { data: conflictData }, { data: quoteData }, lookups] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase.from("bookings").select("*").eq("event_id", id).order("starts_at"),
    supabase.from("booking_conflicts").select("*").eq("event_id", id),
    supabase.from("quote_overview").select("id, number, title, status, total_ex_vat, accepted_name").eq("event_id", id).order("number"),
    getLookups(),
  ]);
  if (!event) notFound();
  const ev = event as EventRow;
  const quotes = (quoteData ?? []) as QuoteRow[];

  const now = new Date().toISOString();
  const allBookings = (bookingData ?? []) as Booking[];
  const showPast = sp.tidigare === "1";
  const pastCount = allBookings.filter((b) => b.ends_at < now).length;
  const bookings = showPast ? allBookings : allBookings.filter((b) => b.ends_at >= now);

  // Gruppera per startdag.
  const byDay = new Map<string, Booking[]>();
  for (const b of bookings) {
    const d = isoToDate(b.starts_at);
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }

  const conflicts = (conflictData ?? []) as BookingConflict[];
  const conflictsFor = (bookingId: string) => conflicts.filter((c) => c.booking_id === bookingId);
  const upcomingConflicts = conflicts.filter((c) => c.ends_at >= now);

  const roomName = new Map(lookups.rooms.map((r) => [r.id, r.name]));
  const setupName = new Map(lookups.setups.map((s) => [s.id, s.name]));
  const bookable = lookups.rooms.filter((r) => r.bookable);
  const capacity = (roomId: string, setupId: string | null) =>
    setupId ? lookups.capacities.find((c) => c.room_id === roomId && c.setup_id === setupId)?.capacity : undefined;
  const company = lookups.companies.find((c) => c.id === ev.company_id);
  const firstDate = allBookings[0] ? isoToDate(allBookings[0].starts_at) : null;

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-2">
        <Link href="/evenemang" className="text-sm text-muted hover:underline">← Evenemang</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{ev.title}</h1>
          <StatusPill status={ev.status} />
          {company && <Link className="text-sm text-muted hover:underline" href={`/kunder/${company.id}`}>{company.name}</Link>}
        </div>
        {ev.status === "preliminar" && ev.option_expires_on && (
          <p className="text-sm text-st-preliminar">Optionen gäller till {fmtDate(ev.option_expires_on)}.</p>
        )}
      </div>

      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <Ok>Evenemanget är sparat.</Ok>}
      {sp.andrat && <Ok>Bokningen är ändrad.</Ok>}
      {sp.kopierad && <Ok>Kopian är skapad med status Förfrågan. Byt gärna namn och kontrollera tiderna.</Ok>}
      {sp.tillagt && <Ok>{sp.tillagt} bokning{sp.tillagt === "1" ? "" : "ar"} har lagts till.</Ok>}
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
          <p className="text-sm text-muted">Inga {pastCount ? "kommande " : ""}bokningar. Lägg till lokaler och tider nedan.</p>
        ) : (
          <div className="grid gap-4">
            {[...byDay].map(([day, list]) => (
              <div key={day} className="grid gap-1">
                <div className="flex flex-wrap items-center gap-3 border-b border-line pb-1">
                  <h3 className="font-display font-semibold">
                    {dayLong(day)} {fmtDayMonth(day)} {day.slice(0, 4)}
                  </h3>
                  <span className="text-xs text-muted">{list.length} lokal{list.length === 1 ? "" : "er"}</span>
                  <span className="flex-1" />
                  {booker && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted hover:text-fg">Kopiera dagen</summary>
                      <form action={copyDay.bind(null, id, day)} className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-muted" htmlFor={`to-${day}`}>Till</label>
                        <input className="input w-40" id={`to-${day}`} name="to_date" type="date" required defaultValue={addDays(day, 7)} />
                        <button className="btn" type="submit">Kopiera</button>
                      </form>
                    </details>
                  )}
                </div>
                <ul className="grid">
                  {list.map((b) => {
                    const cs = conflictsFor(b.id);
                    const cap = capacity(b.room_id, b.setup_id);
                    const over = cap != null && ev.participants != null && ev.participants > cap;
                    const multiDay = isoToDate(b.ends_at) !== day;
                    return (
                      <li key={b.id} className={`relative grid gap-1 rounded-md px-2 py-2 ${cs.length ? "bg-warn-soft/60" : "hover:bg-sunk/50"}`}>
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <span className="font-mono text-sm w-28 shrink-0">
                            {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                            {multiDay && <span className="text-xs text-muted"> +{daysBetween(day, isoToDate(b.ends_at))}d</span>}
                          </span>
                          <span className="font-semibold min-w-0">{roomName.get(b.room_id) ?? "Okänd lokal"}</span>
                          {b.setup_id && (
                            <span className={`text-sm ${over ? "text-warn" : "text-muted"}`}>
                              {setupName.get(b.setup_id)}{cap != null ? `, max ${cap}` : ""}{over ? ` (${ev.participants} deltagare)` : ""}
                            </span>
                          )}
                          {b.note && <span className="text-sm text-muted">{b.note}</span>}
                          <span className="flex-1" />
                          {booker && (
                            <span className="flex items-center gap-1">
                              <details className="group">
                                <summary className="btn btn-ghost text-sm px-2 list-none cursor-pointer">Ändra</summary>
                                <form
                                  action={updateBooking.bind(null, id, b.id)}
                                  className="absolute left-4 right-4 sm:left-auto sm:right-8 z-10 mt-1 card p-4 grid gap-3 sm:w-[560px] shadow-lg"
                                >
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="field sm:col-span-2">
                                      <label className="label" htmlFor={`room-${b.id}`}>Lokal</label>
                                      <select className="input" id={`room-${b.id}`} name="room_id" defaultValue={b.room_id}>
                                        {bookable.map((r) => (
                                          <option key={r.id} value={r.id}>{"   ".repeat(depthOf(lookups.rooms, r.id))}{r.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label className="label" htmlFor={`s-${b.id}`}>Start</label>
                                      <input className="input" id={`s-${b.id}`} name="starts_at" type="datetime-local" step={900} defaultValue={isoToLocal(b.starts_at)} required />
                                    </div>
                                    <div className="field">
                                      <label className="label" htmlFor={`e-${b.id}`}>Slut</label>
                                      <input className="input" id={`e-${b.id}`} name="ends_at" type="datetime-local" step={900} defaultValue={isoToLocal(b.ends_at)} required />
                                    </div>
                                    <div className="field">
                                      <label className="label" htmlFor={`setup-${b.id}`}>Möblering</label>
                                      <select className="input" id={`setup-${b.id}`} name="setup_id" defaultValue={b.setup_id ?? ""}>
                                        <option value="">Ej bestämt</option>
                                        {lookups.setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label className="label" htmlFor={`note-${b.id}`}>Notering</label>
                                      <input className="input" id={`note-${b.id}`} name="note" defaultValue={b.note ?? ""} />
                                    </div>
                                  </div>
                                  <div><button className="btn btn-primary" type="submit">Spara</button></div>
                                </form>
                              </details>
                              <form action={deleteBooking.bind(null, id, b.id)}>
                                <ConfirmButton label="Ta bort" question="Ta bort?" confirmLabel="Ja" className="btn btn-ghost text-sm text-warn px-2" />
                              </form>
                            </span>
                          )}
                        </div>
                        {cs.map((c) => (
                          <span key={c.other_booking_id} className="text-xs text-warn pl-0 sm:pl-32">
                            Krockar med <Link className="underline" href={`/evenemang/${c.other_event_id}`}>{c.other_event_title}</Link> i{" "}
                            {c.other_room_name}, {fmtRange(c.other_starts_at, c.other_ends_at)}
                          </span>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {booker && (
          <details className="rounded-lg border border-line p-4" open={allBookings.length === 0}>
            <summary className="cursor-pointer font-semibold">Lägg till bokningar</summary>
            <form action={addBookings.bind(null, id)} className="mt-4 grid gap-4">
              <BookingFields lookups={lookups} defaultDate={firstDate ?? undefined} />
              <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
            </form>
          </details>
        )}
      </section>

      {/* Offerter */}
      <section className="card p-5 grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Offerter</h2>
          <span className="flex-1" />
          {booker && <Link className="btn" href={`/offerter/ny?evenemang=${id}`}>Skapa offert</Link>}
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted">Ingen offert ännu. En ny offert fylls i med lokalerna från bokningarna ovan.</p>
        ) : (
          <ul className="grid gap-2">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3">
                <Link className="font-semibold hover:underline underline-offset-2" href={`/offerter/${q.id}`}>#{q.number} {q.title}</Link>
                <span className="text-sm">{fmtKr(Number(q.total_ex_vat))} exkl. moms</span>
                <span className={`pill q-${q.status}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
                {q.status === "accepterad" && q.accepted_name && <span className="text-sm text-muted">av {q.accepted_name}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Uppgifter */}
      <form action={updateEvent.bind(null, id)} className="card p-5 grid gap-4">
        <h2 className="text-lg font-semibold">Uppgifter</h2>
        <EventFields event={ev} lookups={lookups} disabled={!booker} />
        {booker && <div><button className="btn btn-primary" type="submit">Spara ändringar</button></div>}
      </form>

      {booker && (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={duplicateEvent.bind(null, id)} className="card p-4 grid gap-2">
            <h2 className="font-semibold">Kopiera evenemanget</h2>
            <p className="text-sm text-muted">Skapar ett nytt evenemang med samma uppgifter och lokaler, flyttat så att det börjar på datumet du väljer.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-44" name="new_start" type="date" required aria-label="Nytt startdatum" defaultValue={firstDate ? addDays(firstDate, 7) : ""} />
              <button className="btn" type="submit">Skapa kopia</button>
            </div>
          </form>
          <form action={deleteEvent.bind(null, id)} className="card p-4 grid gap-2 content-start">
            <h2 className="font-semibold">Ta bort</h2>
            <p className="text-sm text-muted">Vill du behålla historiken, sätt status till Avbokad i stället.</p>
            <div>
              <ConfirmButton label="Ta bort evenemanget" question="Evenemanget och alla dess bokningar tas bort för gott." confirmLabel="Ta bort" />
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Ok({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{children}</p>;
}

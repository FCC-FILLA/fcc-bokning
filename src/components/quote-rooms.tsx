import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { depthOf } from "@/lib/lokaler";
import type { Lookups } from "@/lib/lookups";
import { addQuoteRoom, bookQuoteRooms, copyBookingsToQuote, deleteQuoteRoom } from "@/app/(app)/offerter/actions";

type Row = { id: string; room_id: string; starts_at: string; ends_at: string; setup_id: string | null; note: string | null };

/** Offertens lokaler och tider: programmet i offerten. Syns i kalendern som offererat tills de bokas. */
export async function QuoteRooms({ quoteId, eventId, lookups, locked, error }: { quoteId: string; eventId: string | null; lookups: Lookups; locked: boolean; error?: string }) {
  const supabase = await createClient();
  const [{ data }, { count: bookingCount }] = await Promise.all([
    supabase.from("quote_rooms").select("*").eq("quote_id", quoteId).order("starts_at"),
    eventId ? supabase.from("bookings").select("id", { count: "exact", head: true }).eq("event_id", eventId) : Promise.resolve({ count: 0 }),
  ]);
  const rows = (data ?? []) as Row[];
  const roomName = new Map(lookups.rooms.map((r) => [r.id, r.name]));
  const setupName = new Map(lookups.setups.map((s) => [s.id, s.name]));
  const bookable = lookups.rooms.filter((r) => r.bookable);

  return (
    <section id="lokaler" className="card p-5 grid gap-4 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Lokaler och tider</h2>
        <span className="text-sm text-muted">Offertens program. Hänger inte ihop med prisraderna.</span>
        <span className="flex-1" />
        {!locked && eventId && !!bookingCount && rows.length === 0 && (
          <form action={copyBookingsToQuote.bind(null, quoteId)}><button className="btn btn-ghost text-sm" type="submit">Kopiera från evenemanget ({bookingCount})</button></form>
        )}
        {!locked && rows.length > 0 && (
          <form action={bookQuoteRooms.bind(null, quoteId)}>
            <button className="btn text-sm" type="submit">{eventId ? "Boka lokalerna på evenemanget" : "Skapa evenemang och boka"}</button>
          </form>
        )}
      </div>
      {error && <p className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {eventId && bookingCount ? "Inga egna lokaler. Offerten visar evenemangets bokningar som program." : "Inga lokaler ännu. Lägg till dem nedan så syns de i kalendern som offererade."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="w-40 capitalize">{fmtDate(r.starts_at)}</span>
              <span className="font-mono w-28">{fmtTime(r.starts_at)}–{fmtTime(r.ends_at)}</span>
              <span className="font-semibold">{roomName.get(r.room_id) ?? "Lokal"}</span>
              {r.setup_id && <span className="text-muted">{setupName.get(r.setup_id)}</span>}
              {r.note && <span className="text-muted">{r.note}</span>}
              <span className="flex-1" />
              {!locked && (
                <form action={deleteQuoteRoom.bind(null, quoteId, r.id)}>
                  <button className="btn btn-ghost px-2 text-sm text-warn" type="submit" aria-label="Ta bort lokalen">✕</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <form action={addQuoteRoom.bind(null, quoteId)} className="grid gap-3 sm:grid-cols-[2fr_1fr_100px_100px_80px] sm:items-end">
          <div className="field">
            <label className="label" htmlFor="qr-room">Lokal</label>
            <select className="input" id="qr-room" name="room_id" required defaultValue="">
              <option value="" disabled>Välj lokal</option>
              {bookable.map((r) => <option key={r.id} value={r.id}>{"   ".repeat(depthOf(lookups.rooms, r.id))}{r.name}</option>)}
            </select>
          </div>
          <div className="field"><label className="label" htmlFor="qr-date">Datum</label><input className="input" id="qr-date" name="date" type="date" required /></div>
          <div className="field"><label className="label" htmlFor="qr-from">Från</label><input className="input" id="qr-from" name="from" type="time" step={900} defaultValue="08:00" required /></div>
          <div className="field"><label className="label" htmlFor="qr-to">Till</label><input className="input" id="qr-to" name="to" type="time" step={900} defaultValue="17:00" required /></div>
          <div className="field"><label className="label" htmlFor="qr-days">Dagar</label><input className="input" id="qr-days" name="days" type="number" min={1} max={31} defaultValue={1} /></div>
          <div className="field sm:col-span-2">
            <label className="label" htmlFor="qr-setup">Möblering</label>
            <select className="input" id="qr-setup" name="setup_id" defaultValue="">
              <option value="">Ej bestämt</option>
              {lookups.setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field sm:col-span-2"><label className="label" htmlFor="qr-note">Notering</label><input className="input" id="qr-note" name="note" /></div>
          <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
        </form>
      )}
    </section>
  );
}

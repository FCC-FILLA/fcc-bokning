import { depthOf } from "@/lib/lokaler";
import type { Lookups } from "@/lib/lookups";

/** Lokalval, datum och tid för en eller flera bokningar, med möjlighet att upprepa varje vecka. */
export function BookingFields({
  lookups,
  defaultRoom,
  defaultDate,
}: {
  lookups: Lookups;
  defaultRoom?: string;
  defaultDate?: string;
}) {
  const bookable = lookups.rooms.filter((r) => r.bookable);
  const capText = (roomId: string) => {
    const caps = lookups.capacities.filter((c) => c.room_id === roomId);
    if (!caps.length) return "";
    return `max ${Math.max(...caps.map((c) => c.capacity))}`;
  };

  return (
    <div className="grid gap-4">
      <div className="field">
        <span className="label">Lokaler</span>
        <div className="grid gap-x-6 gap-y-1 rounded-lg border border-line bg-bg p-3 sm:grid-cols-2 lg:grid-cols-3">
          {bookable.map((r) => {
            const depth = depthOf(lookups.rooms, r.id);
            return (
              <label key={r.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: depth * 16 }}>
                <input type="checkbox" name="room_id" value={r.id} defaultChecked={r.id === defaultRoom} />
                <span className={depth ? "" : "font-semibold"}>{r.name}</span>
                <span className="text-xs text-muted">{capText(r.id)}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        <div className="field col-span-2 sm:col-span-1">
          <label className="label" htmlFor="date">Datum</label>
          <input className="input" id="date" name="date" type="date" defaultValue={defaultDate ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="from">Från</label>
          <input className="input" id="from" name="from" type="time" step={900} defaultValue="08:00" />
        </div>
        <div className="field">
          <label className="label" htmlFor="to">Till</label>
          <input className="input" id="to" name="to" type="time" step={900} defaultValue="17:00" />
        </div>
        <div className="field">
          <label className="label" htmlFor="setup_id">Möblering</label>
          <select className="input" id="setup_id" name="setup_id" defaultValue="">
            <option value="">Ej bestämt</option>
            {lookups.setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="repeat_weeks">Antal veckor</label>
          <input className="input" id="repeat_weeks" name="repeat_weeks" type="number" min={1} max={52} defaultValue={1} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="booking_note">Notering för bokningen</label>
        <input className="input" id="booking_note" name="booking_note" placeholder="T.ex. bygg från 08:00, riv till 01:00" />
      </div>
      <p className="text-sm text-muted">
        Räkna med bygg och riv i tiderna. Slutar bokningen efter midnatt, skriv bara sluttiden, t.ex. 18:00–02:00.
        Antal veckor över 1 skapar samma bokning varje vecka.
      </p>
    </div>
  );
}

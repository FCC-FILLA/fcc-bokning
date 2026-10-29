import { isoToDate, isoToLocal } from "@/lib/datum";
import { KIND_LABEL, SHIFT_STATUS_LABEL, type Shift, type StaffFunction } from "@/lib/personal";

type Opt = { id: string; name: string };

/** Fälten för ett pass: funktion, tid, antal, evenemang, lokal och vem det riktar sig till. */
export function ShiftFields({
  functions,
  events,
  rooms,
  suppliers,
  shift,
  defaults,
  hideEvent,
  allowDays,
}: {
  functions: StaffFunction[];
  events: (Opt & { when?: string })[];
  rooms: Opt[];
  suppliers: Opt[];
  shift?: Partial<Shift>;
  defaults?: { date?: string; from?: string; to?: string; event_id?: string };
  hideEvent?: boolean;
  allowDays?: boolean;
}) {
  const date = shift?.starts_at ? isoToDate(shift.starts_at) : (defaults?.date ?? "");
  const from = shift?.starts_at ? isoToLocal(shift.starts_at).slice(11) : (defaults?.from ?? "17:00");
  const to = shift?.ends_at ? isoToLocal(shift.ends_at).slice(11) : (defaults?.to ?? "23:00");
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-[1.5fr_1fr_100px_100px_90px]">
        <div className="field col-span-2 sm:col-span-1">
          <label className="label" htmlFor="function_id">Funktion</label>
          <select className="input" id="function_id" name="function_id" required defaultValue={shift?.function_id ?? ""}>
            <option value="" disabled>Välj funktion</option>
            {functions.filter((f) => f.active || f.id === shift?.function_id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="field col-span-2 sm:col-span-1">
          <label className="label" htmlFor="date">Datum</label>
          <input className="input" id="date" name="date" type="date" required defaultValue={date} />
        </div>
        <div className="field">
          <label className="label" htmlFor="from">Från</label>
          <input className="input" id="from" name="from" type="time" step={900} required defaultValue={from} />
        </div>
        <div className="field">
          <label className="label" htmlFor="to">Till</label>
          <input className="input" id="to" name="to" type="time" step={900} required defaultValue={to} />
        </div>
        <div className="field">
          <label className="label" htmlFor="needed">Antal</label>
          <input className="input text-right" id="needed" name="needed" type="number" min={1} max={500} required defaultValue={shift?.needed ?? 1} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {!hideEvent && (
          <div className="field">
            <label className="label" htmlFor="event_id">Evenemang</label>
            <select className="input" id="event_id" name="event_id" defaultValue={shift?.event_id ?? defaults?.event_id ?? ""}>
              <option value="">Inget (fristående pass)</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.when ? `${e.when} · ` : ""}{e.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="room_id">Plats</label>
          <select className="input" id="room_id" name="room_id" defaultValue={shift?.room_id ?? ""}>
            <option value="">Ingen särskild</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="title">Rubrik (valfri)</label>
          <input className="input" id="title" name="title" defaultValue={shift?.title ?? ""} placeholder="T.ex. Insläpp och paus" />
        </div>
      </div>
      <details className="grid gap-3" open={!!shift && (shift.staff_kind !== "intern" || !!shift.note || shift.hourly_rate != null || shift.status !== "oppen")}>
        <summary className="cursor-pointer text-sm text-muted">Fler val: vem passet gäller, status, timpris och anteckning</summary>
        <div className="grid gap-3 sm:grid-cols-4 mt-3">
          <div className="field">
            <label className="label" htmlFor="staff_kind">Gäller</label>
            <select className="input" id="staff_kind" name="staff_kind" defaultValue={shift?.staff_kind ?? "intern"}>
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => <option key={k} value={k}>{k === "intern" ? "Internpersonal" : KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="supplier_id">Leverantör</label>
            <select className="input" id="supplier_id" name="supplier_id" defaultValue={shift?.supplier_id ?? ""}>
              <option value="">–</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="status">Status</label>
            <select className="input" id="status" name="status" defaultValue={shift?.status ?? "oppen"}>
              {(Object.keys(SHIFT_STATUS_LABEL) as (keyof typeof SHIFT_STATUS_LABEL)[]).map((k) => <option key={k} value={k}>{SHIFT_STATUS_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="hourly_rate">Timpris (valfritt)</label>
            <input className="input text-right" id="hourly_rate" name="hourly_rate" inputMode="decimal" defaultValue={shift?.hourly_rate ?? ""} placeholder="Funktionens" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px]">
          <div className="field">
            <label className="label" htmlFor="note">Anteckning till personalen</label>
            <input className="input" id="note" name="note" defaultValue={shift?.note ?? ""} placeholder="T.ex. samling vid personalingången" />
          </div>
          <div className="field">
            <label className="label" htmlFor="respond_hours">Svarstid frilans (h)</label>
            <input className="input text-right" id="respond_hours" name="respond_hours" type="number" min={1} max={336} defaultValue={shift?.respond_hours ?? 24} />
          </div>
          {allowDays && (
            <div className="field">
              <label className="label" htmlFor="days">Dagar i rad</label>
              <input className="input text-right" id="days" name="days" type="number" min={1} max={14} defaultValue={1} />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

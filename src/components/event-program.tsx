import Link from "next/link";
import { dayShort, fmtDayMonth, fmtTime, isoToDate } from "@/lib/datum";
import { depthOf } from "@/lib/lokaler";
import type { Lookups } from "@/lib/lookups";
import { PHASES, PHASE_LABEL, chunkDays, describeDates, groupSeries, isPhase, matrixGroups, type Phase } from "@/lib/serier";
import type { Booking, BookingConflict } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { bulkEditBookings, deleteSeries, updateSeries } from "@/app/(app)/evenemang/actions";

export type ProgramView = "matris" | "serier" | "lista";
export const PROGRAM_VIEWS: { id: ProgramView; label: string }[] = [
  { id: "matris", label: "Matris" },
  { id: "serier", label: "Serier" },
  { id: "lista", label: "Lista" },
];

const phaseOf = (b: Booking): Phase => (isPhase(b.phase) ? b.phase : "genomforande");

/** Sammanfattning överst på Program och lokaler. */
export function ProgramSummary({ bookings, conflicts }: { bookings: Booking[]; conflicts: BookingConflict[] }) {
  const series = groupSeries(bookings);
  const days = new Set(bookings.map((b) => isoToDate(b.starts_at)));
  const rooms = new Set(bookings.map((b) => b.room_id));
  const conflictIds = new Set(conflicts.map((c) => c.booking_id));
  const perPhase = PHASES.map((p) => [p, bookings.filter((b) => phaseOf(b) === p).length] as const).filter(([, n]) => n > 0);
  const first = [...days].sort()[0];
  const last = [...days].sort().at(-1);
  const stats = [
    { label: "Bokningar", value: bookings.length },
    { label: "Serier", value: series.length },
    { label: "Lokaler", value: rooms.size },
    { label: "Dagar", value: days.size },
    { label: "Krockar", value: conflictIds.size, warn: conflictIds.size > 0 },
  ];
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-sunk px-3 py-2">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={`text-xl font-semibold tabular-nums ${s.warn ? "text-warn" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {first && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {fmtDayMonth(first)}
            {last && last !== first ? ` – ${fmtDayMonth(last)} ${last.slice(0, 4)}` : ` ${first.slice(0, 4)}`}
          </span>
          {perPhase.map(([p, n]) => (
            <span key={p} className={`pill ph-${p}`}>
              {PHASE_LABEL[p]} {n}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** Väljare mellan matris, serier och lista. */
export function ProgramViewSwitch({ eventId, view }: { eventId: string; view: ProgramView }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Visa bokningar som">
      {PROGRAM_VIEWS.map((v) => (
        <Link
          key={v.id}
          href={`/evenemang/${eventId}?vy=${v.id}#bokningar`}
          aria-current={view === v.id ? "page" : undefined}
          className={`rounded-md px-3 py-1 text-sm font-medium ${view === v.id ? "bg-brand text-white" : "text-muted hover:text-fg"}`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

/** Lokaler × dagar. Varje ruta visar bokningarna som börjar den dagen, färgade efter fas. */
export function BookingMatrix({
  eventId,
  bookings,
  conflicts,
  lookups,
}: {
  eventId: string;
  bookings: Booking[];
  conflicts: BookingConflict[];
  lookups: Lookups;
}) {
  const conflictIds = new Set(conflicts.map((c) => c.booking_id));
  const groups = matrixGroups(lookups.rooms, new Set(bookings.map((b) => b.room_id)));
  const setupName = new Map(lookups.setups.map((s) => [s.id, s.name]));
  const cell = new Map<string, Booking[]>();
  for (const b of bookings) {
    const k = `${b.room_id}|${isoToDate(b.starts_at)}`;
    cell.set(k, [...(cell.get(k) ?? []), b]);
  }
  const chunks = chunkDays(bookings.map((b) => isoToDate(b.starts_at)));

  return (
    <div className="grid gap-5">
      {chunks.map((days) => (
        <div key={days[0]} className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] w-44 bg-surface px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">Lokal</th>
                {days.map((d) => (
                  <th key={d} className="px-1 py-2 text-left font-normal">
                    <span className="block text-xs text-muted">{dayShort(d)}</span>
                    <span className="font-display font-semibold">{fmtDayMonth(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <MatrixGroupRows key={g.rooms[0].id} eventId={eventId} group={g} days={days} cell={cell} conflictIds={conflictIds} setupName={setupName} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {PHASES.map((p) => <span key={p} className={`pill ph-${p}`}>{PHASE_LABEL[p]}</span>)}
        <span className="pill bg-warn-soft text-warn ring-1 ring-warn">Krock</span>
        <span>Klicka på en bokning för att ändra den.</span>
      </p>
    </div>
  );
}

function MatrixGroupRows({
  eventId,
  group,
  days,
  cell,
  conflictIds,
  setupName,
}: {
  eventId: string;
  group: ReturnType<typeof matrixGroups>[number];
  days: string[];
  cell: Map<string, Booking[]>;
  conflictIds: Set<string>;
  setupName: Map<string, string>;
}) {
  const rows = group.rooms.filter((r) => days.some((d) => cell.has(`${r.id}|${d}`)));
  if (!rows.length) return null;
  return (
    <>
      {group.label && (
        <tr>
          <td colSpan={days.length + 1} className="bg-sunk px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            {group.label}
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <tr key={r.id} className="border-b border-line align-top">
          <th scope="row" className={`sticky left-0 z-[1] bg-surface py-1.5 pr-2 text-left font-semibold ${group.label && r.parent_id ? "pl-5" : "pl-2"}`}>
            {r.name}
          </th>
          {days.map((d) => (
            <td key={d} className="px-1 py-1">
              <div className="grid gap-0.5">
                {(cell.get(`${r.id}|${d}`) ?? []).map((b) => {
                  const span = isoToDate(b.ends_at) !== d && fmtTime(b.ends_at) !== "00:00";
                  const conflict = conflictIds.has(b.id);
                  const detail = [b.setup_id ? setupName.get(b.setup_id) : null, b.note].filter(Boolean).join(" · ");
                  return (
                    <Link
                      key={b.id}
                      href={`/evenemang/${eventId}?vy=lista&tidigare=1#b-${b.id}`}
                      title={`${PHASE_LABEL[phaseOf(b)]}${detail ? `: ${detail}` : ""}${conflict ? " (krock)" : ""}`}
                      className={`block truncate rounded px-1.5 py-0.5 text-xs tabular-nums hover:brightness-95 ph-${phaseOf(b)} ${conflict ? "ring-1 ring-warn" : ""}`}
                    >
                      {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                      {span ? "+" : ""}
                      {detail && <span className="opacity-80"> {detail}</span>}
                    </Link>
                  );
                })}
              </div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bokningar som bara skiljer sig i datum visas som en rad och kan ändras eller tas bort tillsammans. */
export function BookingSeriesList({
  eventId,
  bookings,
  conflicts,
  lookups,
  booker,
}: {
  eventId: string;
  bookings: Booking[];
  conflicts: BookingConflict[];
  lookups: Lookups;
  booker: boolean;
}) {
  const conflictIds = new Set(conflicts.map((c) => c.booking_id));
  const order = new Map(lookups.rooms.map((r) => [r.id, r.sort_order]));
  const roomName = new Map(lookups.rooms.map((r) => [r.id, r.name]));
  const setupName = new Map(lookups.setups.map((s) => [s.id, s.name]));
  const bookable = lookups.rooms.filter((r) => r.bookable);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const series = groupSeries(bookings).sort(
    (a, b) => (order.get(a.room_id) ?? 0) - (order.get(b.room_id) ?? 0) || PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.dates[0].localeCompare(b.dates[0]) || a.from.localeCompare(b.from),
  );

  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {series.map((s) => {
          const nConflicts = s.ids.filter((id) => conflictIds.has(id)).length;
          return (
            <li key={s.key} className={`relative grid gap-1 px-3 py-2 ${nConflicts ? "bg-warn-soft/50" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="w-40 shrink-0 font-semibold">{roomName.get(s.room_id) ?? "Okänd lokal"}</span>
                <span className={`pill ph-${s.phase}`}>{PHASE_LABEL[s.phase]}</span>
                <span className="font-mono text-sm">
                  {s.from}–{s.to}
                  {s.spanDays > 0 && <span className="text-xs text-muted"> +{s.spanDays}d</span>}
                </span>
                <span className="text-sm">{describeDates(s.dates)}</span>
                <span className="text-xs text-muted">{s.ids.length} st</span>
                {s.setup_id && <span className="text-sm text-muted">{setupName.get(s.setup_id)}</span>}
                {s.note && <span className="text-sm text-muted">{s.note}</span>}
                {nConflicts > 0 && <span className="text-xs font-semibold text-warn">{nConflicts} krock{nConflicts === 1 ? "" : "ar"}</span>}
                <span className="flex-1" />
                {booker && (
                  <span className="flex items-center gap-1">
                    <details>
                      <summary className="btn btn-ghost list-none px-2 text-sm cursor-pointer">Ändra serien</summary>
                      <div className="absolute left-2 right-2 z-10 mt-1 card grid gap-4 p-4 shadow-lg sm:left-auto sm:right-4 sm:w-[600px]">
                        <form action={updateSeries.bind(null, eventId)} className="grid gap-3">
                          <input type="hidden" name="ids" value={JSON.stringify(s.ids)} />
                          <p className="text-sm text-muted">Ändringen gäller alla {s.ids.length} bokningar i serien. Datumen behålls.</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="field sm:col-span-2">
                              <label className="label" htmlFor={`sr-${s.key}`}>Lokal</label>
                              <select className="input" id={`sr-${s.key}`} name="room_id" defaultValue={s.room_id}>
                                {bookable.map((r) => (
                                  <option key={r.id} value={r.id}>{"   ".repeat(depthOf(lookups.rooms, r.id))}{r.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label className="label" htmlFor={`sf-${s.key}`}>Från</label>
                              <input className="input" id={`sf-${s.key}`} name="from" type="time" step={900} defaultValue={s.from} required />
                            </div>
                            <div className="field">
                              <label className="label" htmlFor={`st-${s.key}`}>Till</label>
                              <input className="input" id={`st-${s.key}`} name="to" type="time" step={900} defaultValue={s.to} required />
                            </div>
                            <div className="field">
                              <label className="label" htmlFor={`sp-${s.key}`}>Fas</label>
                              <select className="input" id={`sp-${s.key}`} name="phase" defaultValue={s.phase}>
                                {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
                              </select>
                            </div>
                            <div className="field">
                              <label className="label" htmlFor={`ss-${s.key}`}>Möblering</label>
                              <select className="input" id={`ss-${s.key}`} name="setup_id" defaultValue={s.setup_id ?? ""}>
                                <option value="">Ej bestämt</option>
                                {lookups.setups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </select>
                            </div>
                            <div className="field sm:col-span-2">
                              <label className="label" htmlFor={`sn-${s.key}`}>Notering</label>
                              <input className="input" id={`sn-${s.key}`} name="note" defaultValue={s.note ?? ""} />
                            </div>
                          </div>
                          <div><button className="btn btn-primary" type="submit">Spara för hela serien</button></div>
                        </form>
                        {s.ids.length > 1 && (
                          <form action={deleteSeries.bind(null, eventId)} className="grid gap-2 border-t border-line pt-3">
                            <span className="text-sm font-semibold">Ta bort enskilda dagar</span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {s.ids.map((id) => {
                                const b = byId.get(id)!;
                                const d = isoToDate(b.starts_at);
                                return (
                                  <label key={id} className="flex items-center gap-1.5 text-sm">
                                    <input type="checkbox" name="id" value={id} /> {dayShort(d).toLowerCase()} {fmtDayMonth(d)}
                                  </label>
                                );
                              })}
                            </div>
                            <div><button className="btn btn-danger text-sm" type="submit">Ta bort valda dagar</button></div>
                          </form>
                        )}
                      </div>
                    </details>
                    <form action={deleteSeries.bind(null, eventId)}>
                      <input type="hidden" name="ids" value={JSON.stringify(s.ids)} />
                      <ConfirmButton
                        label="Ta bort"
                        question={s.ids.length > 1 ? `Ta bort alla ${s.ids.length}?` : "Ta bort?"}
                        confirmLabel="Ja"
                        className="btn btn-ghost px-2 text-sm text-warn"
                      />
                    </form>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {booker && <BulkEdit eventId={eventId} lookups={lookups} roomIds={[...new Set(bookings.map((b) => b.room_id))]} />}
    </div>
  );
}

/** Massändring: välj bokningar med lokal, period och fas, och flytta, byt fas eller ta bort. */
function BulkEdit({ eventId, lookups, roomIds }: { eventId: string; lookups: Lookups; roomIds: string[] }) {
  const rooms = lookups.rooms.filter((r) => roomIds.includes(r.id));
  return (
    <details className="rounded-lg border border-line p-4">
      <summary className="cursor-pointer font-semibold">Massändra bokningar</summary>
      <form action={bulkEditBookings.bind(null, eventId)} className="mt-4 grid gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-sm text-muted">Vilka bokningar? Tomt fält betyder alla.</legend>
          <div className="field">
            <label className="label" htmlFor="bulk-room">Lokal</label>
            <select className="input" id="bulk-room" name="room_id" defaultValue="">
              <option value="">Alla lokaler</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="bulk-from">Från datum</label>
            <input className="input" id="bulk-from" name="from_date" type="date" />
          </div>
          <div className="field">
            <label className="label" htmlFor="bulk-to">Till datum</label>
            <input className="input" id="bulk-to" name="to_date" type="date" />
          </div>
          <div className="field">
            <label className="label" htmlFor="bulk-only-phase">Fas</label>
            <select className="input" id="bulk-only-phase" name="only_phase" defaultValue="">
              <option value="">Alla faser</option>
              {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
            </select>
          </div>
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm text-muted">Vad ska göras?</legend>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="radio" name="action" value="flytta" defaultChecked /> Flytta start
            <input className="input w-24" name="shift_start" type="number" step={15} defaultValue={0} aria-label="Minuter att flytta start" /> min och slut
            <input className="input w-24" name="shift_end" type="number" step={15} defaultValue={0} aria-label="Minuter att flytta slut" /> min
            <span className="text-xs text-muted">(minus = tidigare)</span>
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="radio" name="action" value="fas" /> Sätt fas till
            <select className="input w-44" name="phase" defaultValue="genomforande" aria-label="Ny fas">
              {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-warn">
            <input type="radio" name="action" value="ta-bort" /> Ta bort bokningarna
          </label>
        </fieldset>
        <div>
          <ConfirmButton label="Genomför" question="Ändringen gäller alla bokningar som matchar urvalet." confirmLabel="Ja, genomför" className="btn btn-primary" />
        </div>
      </form>
    </details>
  );
}

"use client";

import { useState } from "react";

type RoomOption = { id: string; name: string; depth: number };
type SetupOption = { id: string; name: string };
export type TemplateRow = { day: number; room_id: string; from: string; to: string; setup_id: string; note: string; phase?: string };
type Row = TemplateRow & { key: number };

let k = 1;

/** Mallens lokaler och tider: dag 1, dag 2 … i stället för datum. Skickas som JSON i "template_rows". */
export function TemplateRows({ rooms, setups, initial, readOnly }: { rooms: RoomOption[]; setups: SetupOption[]; initial: TemplateRow[]; readOnly?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ day: 1, room_id: "", from: "08:00", to: "17:00", setup_id: "", note: "" }]).map((r) => ({ ...r, key: k++ })),
  );
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const payload = JSON.stringify(rows.filter((r) => r.room_id).map(({ day, room_id, from, to, setup_id, note, phase }) => ({ day, room_id, from, to, setup_id, note, phase: phase || "genomforande" })));

  return (
    <div className="grid gap-3">
      <input type="hidden" name="template_rows" value={payload} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-left">
              <th className="label font-semibold w-20">Dag</th>
              <th className="label font-semibold">Lokal</th>
              <th className="label font-semibold w-28">Från</th>
              <th className="label font-semibold w-28">Till</th>
              <th className="label font-semibold w-36">Fas</th>
              <th className="label font-semibold w-40">Möblering</th>
              <th className="label font-semibold">Notering</th>
              {!readOnly && <th className="w-28" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="pr-2">
                  <input className="input" type="number" min={1} max={60} value={r.day} disabled={readOnly} aria-label={`Dag rad ${i + 1}`} onChange={(e) => update(r.key, { day: Math.max(1, Number(e.target.value) || 1) })} />
                </td>
                <td className="pr-2">
                  <select className="input" value={r.room_id} disabled={readOnly} aria-label={`Lokal rad ${i + 1}`} onChange={(e) => update(r.key, { room_id: e.target.value })}>
                    <option value="">Välj lokal</option>
                    {rooms.map((o) => <option key={o.id} value={o.id}>{"   ".repeat(o.depth)}{o.name}</option>)}
                  </select>
                </td>
                <td className="pr-2"><input className="input" type="time" step={900} value={r.from} disabled={readOnly} aria-label={`Från rad ${i + 1}`} onChange={(e) => update(r.key, { from: e.target.value })} /></td>
                <td className="pr-2">
                  <input className="input" type="time" step={900} value={r.to} disabled={readOnly} aria-label={`Till rad ${i + 1}`} onChange={(e) => update(r.key, { to: e.target.value })} />
                  {r.to && r.from && r.to <= r.from && <span className="block text-xs text-muted">slutar nästa dag</span>}
                </td>
                <td className="pr-2">
                  <select className="input" value={r.phase || "genomforande"} disabled={readOnly} aria-label={`Fas rad ${i + 1}`} onChange={(e) => update(r.key, { phase: e.target.value })}>
                    <option value="bygg">Bygg</option>
                    <option value="genomforande">Genomförande</option>
                    <option value="riv">Riv</option>
                  </select>
                </td>
                <td className="pr-2">
                  <select className="input" value={r.setup_id} disabled={readOnly} aria-label={`Möblering rad ${i + 1}`} onChange={(e) => update(r.key, { setup_id: e.target.value })}>
                    <option value="">Ej bestämt</option>
                    {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="pr-2"><input className="input" value={r.note} disabled={readOnly} aria-label={`Notering rad ${i + 1}`} onChange={(e) => update(r.key, { note: e.target.value })} /></td>
                {!readOnly && (
                  <td className="whitespace-nowrap">
                    <button type="button" className="btn btn-ghost px-2 text-sm" onClick={() => setRows((rs) => { const idx = rs.findIndex((x) => x.key === r.key); return [...rs.slice(0, idx + 1), { ...r, key: k++, room_id: "" }, ...rs.slice(idx + 1)]; })}>Kopiera</button>
                    {rows.length > 1 && <button type="button" className="btn btn-ghost px-2 text-sm text-warn" aria-label={`Ta bort rad ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div>
          <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { day: rs.at(-1)?.day ?? 1, room_id: "", from: "08:00", to: "17:00", setup_id: "", note: "", key: k++ }])}>
            + Lägg till rad
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

type RoomOption = { id: string; name: string; depth: number; maxCap: number | null };
type SetupOption = { id: string; name: string };
type Row = { key: number; room_id: string; date: string; from: string; to: string; setup_id: string; note: string };

let nextKey = 1;
const blank = (date = "", room_id = "", from = "08:00", to = "17:00"): Row => ({
  key: nextKey++,
  room_id,
  date,
  from,
  to,
  setup_id: "",
  note: "",
});

/**
 * Flera tidsluckor på en gång: varje rad är en lokal med eget datum och egen tid.
 * Raderna skickas som JSON i fältet "rows". "Antal veckor" upprepar alla rader.
 */
export function BookingRows({
  rooms,
  setups,
  defaultRoom,
  defaultDate,
  defaultFrom,
  defaultTo,
}: {
  rooms: RoomOption[];
  setups: SetupOption[];
  defaultRoom?: string;
  defaultDate?: string;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => [blank(defaultDate ?? "", defaultRoom ?? "", defaultFrom, defaultTo)]);
  const [repeat, setRepeat] = useState(1);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const duplicate = (key: number) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const copy = { ...rs[i], key: nextKey++, room_id: "" };
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
  const remove = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const add = () => setRows((rs) => [...rs, blank(rs.at(-1)?.date ?? defaultDate ?? "")]);

  const filled = rows.filter((r) => r.room_id && r.date && r.from && r.to);
  const payload = JSON.stringify(filled.map(({ room_id, date, from, to, setup_id, note }) => ({ room_id, date, from, to, setup_id, note })));

  return (
    <div className="grid gap-3">
      <input type="hidden" name="rows" value={payload} />
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[820px] text-sm border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-left">
              <th className="label font-semibold pr-2">Lokal</th>
              <th className="label font-semibold pr-2">Datum</th>
              <th className="label font-semibold pr-2">Från</th>
              <th className="label font-semibold pr-2">Till</th>
              <th className="label font-semibold pr-2">Möblering</th>
              <th className="label font-semibold pr-2">Notering</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="pr-2 w-[230px]">
                  <select
                    className="input"
                    aria-label={`Lokal rad ${i + 1}`}
                    value={r.room_id}
                    onChange={(e) => update(r.key, { room_id: e.target.value })}
                  >
                    <option value="">Välj lokal</option>
                    {rooms.map((o) => (
                      <option key={o.id} value={o.id}>
                        {"   ".repeat(o.depth)}
                        {o.name}
                        {o.maxCap ? ` (max ${o.maxCap})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2 w-[150px]">
                  <input className="input" type="date" aria-label={`Datum rad ${i + 1}`} value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} />
                </td>
                <td className="pr-2 w-[105px]">
                  <input className="input" type="time" step={900} aria-label={`Från rad ${i + 1}`} value={r.from} onChange={(e) => update(r.key, { from: e.target.value })} />
                </td>
                <td className="pr-2 w-[105px]">
                  <input className="input" type="time" step={900} aria-label={`Till rad ${i + 1}`} value={r.to} onChange={(e) => update(r.key, { to: e.target.value })} />
                  {r.to && r.from && r.to <= r.from && <span className="block text-xs text-muted mt-0.5">slutar nästa dag</span>}
                </td>
                <td className="pr-2 w-[150px]">
                  <select className="input" aria-label={`Möblering rad ${i + 1}`} value={r.setup_id} onChange={(e) => update(r.key, { setup_id: e.target.value })}>
                    <option value="">Ej bestämt</option>
                    {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="pr-2">
                  <input className="input" aria-label={`Notering rad ${i + 1}`} value={r.note} placeholder="T.ex. bygg" onChange={(e) => update(r.key, { note: e.target.value })} />
                </td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn btn-ghost px-2 text-sm" onClick={() => duplicate(r.key)} title="Kopiera raden">Kopiera</button>
                  {rows.length > 1 && (
                    <button type="button" className="btn btn-ghost px-2 text-sm text-warn" onClick={() => remove(r.key)} aria-label={`Ta bort rad ${i + 1}`}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn" onClick={add}>+ Lägg till rad</button>
        <label className="flex items-center gap-2 text-sm">
          Upprepa varje vecka i
          <input
            className="input w-20"
            type="number"
            name="repeat_weeks"
            min={1}
            max={52}
            value={repeat}
            onChange={(e) => setRepeat(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
          />
          veckor
        </label>
        <span className="text-sm text-muted">
          {filled.length * repeat} bokning{filled.length * repeat === 1 ? "" : "ar"} skapas
        </span>
      </div>
      <p className="text-sm text-muted">
        Ta med bygg och riv i tiderna. &quot;Kopiera&quot; gör en ny rad med samma dag och tid, så väljer du bara en annan lokal.
      </p>
    </div>
  );
}

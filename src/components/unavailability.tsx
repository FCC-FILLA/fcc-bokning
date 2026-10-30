import { fmtDate, fmtTime, isoToDate, todayDate } from "@/lib/datum";

export type Unavailable = { id: string; starts_at: string; ends_at: string; note: string | null };

/** "När jag inte kan jobba": lista och formulär. Används i portalen och på den personliga länken. */
export function UnavailabilityForm({ list, add, remove }: { list: Unavailable[]; add: (fd: FormData) => Promise<void>; remove: (id: string) => Promise<void> }) {
  const today = todayDate();
  const label = (x: Unavailable) => {
    const d1 = isoToDate(x.starts_at), d2 = isoToDate(new Date(new Date(x.ends_at).getTime() - 1).toISOString());
    const allDay = fmtTime(x.starts_at) === "00:00" && fmtTime(x.ends_at) === "00:00";
    if (allDay) return d1 === d2 ? `${fmtDate(d1)}, hela dagen` : `${fmtDate(d1)} – ${fmtDate(d2)}`;
    return d1 === isoToDate(x.ends_at) ? `${fmtDate(d1)} ${fmtTime(x.starts_at)}–${fmtTime(x.ends_at)}` : `${fmtDate(d1)} ${fmtTime(x.starts_at)} – ${fmtDate(isoToDate(x.ends_at))} ${fmtTime(x.ends_at)}`;
  };
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Markera dagar eller tider då du inte kan jobba. Den som planerar ser det direkt, och du får inga förfrågningar om pass då.
      </p>
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="grow capitalize">{label(x)}{x.note ? <span className="text-muted normal-case"> · {x.note}</span> : null}</span>
              <form action={remove.bind(null, x.id)}><button className="btn btn-ghost px-2 text-sm text-warn" type="submit" aria-label="Ta bort">Ta bort</button></form>
            </li>
          ))}
        </ul>
      )}
      <form action={add} className="grid gap-3 sm:grid-cols-2">
        <div className="field"><label className="label" htmlFor="u-from">Från dag</label><input className="input" id="u-from" name="from_date" type="date" min={today} required /></div>
        <div className="field"><label className="label" htmlFor="u-to">Till och med dag</label><input className="input" id="u-to" name="to_date" type="date" min={today} /></div>
        <div className="field"><label className="label" htmlFor="u-ft">Från klockan (valfritt)</label><input className="input" id="u-ft" name="from_time" type="time" step={900} /></div>
        <div className="field"><label className="label" htmlFor="u-tt">Till klockan (valfritt)</label><input className="input" id="u-tt" name="to_time" type="time" step={900} /></div>
        <div className="field sm:col-span-2"><label className="label" htmlFor="u-note">Anledning (valfritt)</label><input className="input" id="u-note" name="note" maxLength={200} placeholder="T.ex. semester, tenta" /></div>
        <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
      </form>
    </div>
  );
}

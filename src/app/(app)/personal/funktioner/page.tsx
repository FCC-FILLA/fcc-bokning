import { canManageStaff, requireProfile } from "@/lib/auth";
import { getStaffLookups } from "@/lib/personal-data";
import { saveFunction } from "../actions";

export const metadata = { title: "Funktioner" };

export default async function FunctionsPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparat?: string }> }) {
  const sp = await searchParams;
  const manager = canManageStaff(await requireProfile());
  const { functions } = await getStaffLookups();

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Funktioner</h1>
        <p className="text-sm text-muted">Vilka roller pass kan gälla. Timpriset används för kostnaden när personen inte har ett eget pris.</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.sparat} är sparad.</p>}

      <div className="card divide-y divide-line">
        <div className="hidden sm:grid grid-cols-[48px_1fr_140px_90px_80px_80px] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Färg</span><span>Namn</span><span className="text-right">Timpris (kr)</span><span className="text-right">Ordning</span><span>Aktiv</span><span />
        </div>
        {functions.map((f) => (
          <form key={f.id} action={saveFunction.bind(null, f.id)} className={`grid grid-cols-[48px_1fr] sm:grid-cols-[48px_1fr_140px_90px_80px_80px] items-center gap-3 px-4 py-2 ${f.active ? "" : "opacity-60"}`}>
            <input type="color" name="color" defaultValue={f.color} disabled={!manager} aria-label={`Färg för ${f.name}`} className="h-9 w-10 cursor-pointer rounded border border-line bg-surface" />
            <input className="input" name="name" defaultValue={f.name} required disabled={!manager} aria-label="Namn" />
            <input className="input text-right" name="hourly_rate" inputMode="decimal" defaultValue={f.hourly_rate || ""} placeholder="0" disabled={!manager} aria-label="Timpris" />
            <input className="input text-right" name="sort_order" inputMode="numeric" defaultValue={f.sort_order} disabled={!manager} aria-label="Ordning" />
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={f.active} disabled={!manager} /> Ja</label>
            {manager && <button className="btn text-sm" type="submit">Spara</button>}
          </form>
        ))}
      </div>

      {manager && (
        <form action={saveFunction.bind(null, null)} className="card p-5 flex flex-wrap items-end gap-3">
          <div className="field">
            <label className="label" htmlFor="new-color">Färg</label>
            <input type="color" id="new-color" name="color" defaultValue="#60272b" className="h-10 w-12 cursor-pointer rounded border border-line bg-surface" />
          </div>
          <div className="field grow min-w-48"><label className="label" htmlFor="new-name">Ny funktion</label><input className="input" id="new-name" name="name" required placeholder="T.ex. Logevärd" /></div>
          <div className="field w-32"><label className="label" htmlFor="new-rate">Timpris</label><input className="input text-right" id="new-rate" name="hourly_rate" inputMode="decimal" /></div>
          <div className="field w-24"><label className="label" htmlFor="new-order">Ordning</label><input className="input text-right" id="new-order" name="sort_order" inputMode="numeric" defaultValue={(functions.at(-1)?.sort_order ?? 0) + 1} /></div>
          <button className="btn btn-primary" type="submit">Lägg till</button>
        </form>
      )}
    </div>
  );
}

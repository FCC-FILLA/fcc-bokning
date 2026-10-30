import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { addReading, deleteReading, saveMeter } from "../actions";

export const metadata = { title: "Mätarställningar" };

type Meter = { id: string; name: string; kind: string; unit: string; location: string | null; meter_no: string | null; active: boolean };
type Reading = { id: string; meter_id: string; read_on: string; value: number; note: string | null };
const KIND: Record<string, string> = { el: "El", vatten: "Vatten", varme: "Värme", kyla: "Kyla", gas: "Gas", annat: "Annat" };
const n = (v: number, d = 2) => Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d });

export default async function MetersPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const today = todayDate();
  const [{ data: m }, { data: r }] = await Promise.all([
    supabase.from("meters").select("*").order("sort_order").order("name"),
    supabase.from("meter_readings").select("id, meter_id, read_on, value, note").order("read_on", { ascending: false }).limit(1000),
  ]);
  const meters = (m ?? []) as Meter[];
  const byMeter = new Map<string, Reading[]>();
  for (const x of (r ?? []) as Reading[]) byMeter.set(x.meter_id, [...(byMeter.get(x.meter_id) ?? []), { ...x, value: Number(x.value) }]);

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Mätarställningar</h1>
        <p className="text-sm text-muted">Läs av mätarna, gärna samma dag varje månad. Förbrukningen räknas fram mellan avläsningarna.</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Avläsningen är sparad.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {meters.filter((x) => x.active).map((x) => {
          const rs = byMeter.get(x.id) ?? [];
          const rows = rs.slice(0, 13).map((cur, i) => {
            const prev = rs[i + 1];
            const used = prev ? cur.value - prev.value : null;
            const days = prev ? Math.max(1, Math.round((Date.parse(cur.read_on) - Date.parse(prev.read_on)) / 864e5)) : null;
            return { ...cur, used, perDay: used != null && days ? used / days : null };
          });
          const avg = rows.filter((x) => x.perDay != null && x.perDay >= 0).map((x) => x.perDay!);
          const mean = avg.length ? avg.reduce((s, v) => s + v, 0) / avg.length : null;
          return (
            <section key={x.id} id={x.id} className="card p-4 grid gap-3 scroll-mt-24">
              <div>
                <h2 className="font-semibold">{x.name}</h2>
                <p className="text-xs text-muted">{[KIND[x.kind], x.unit, x.location, x.meter_no && `nr ${x.meter_no}`].filter(Boolean).join(" · ")}</p>
              </div>
              {editor && (
                <form action={addReading.bind(null, x.id)} className="flex flex-wrap items-end gap-2">
                  <input className="input h-9 w-36" name="read_on" type="date" defaultValue={today} aria-label="Datum" />
                  <input className="input h-9 w-32 text-right" name="value" inputMode="decimal" required placeholder={rows[0] ? n(rows[0].value) : "Ställning"} aria-label={`Ställning i ${x.unit}`} />
                  <span className="text-sm text-muted pb-2">{x.unit}</span>
                  <input className="input h-9 grow min-w-28" name="note" placeholder="Kommentar" aria-label="Kommentar" />
                  <button className="btn btn-primary" type="submit">Spara</button>
                </form>
              )}
              {rows.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted"><tr><th className="py-1">Datum</th><th className="text-right">Ställning</th><th className="text-right">Förbrukning</th><th className="text-right">Per dag</th><th /></tr></thead>
                  <tbody>
                    {rows.map((row) => {
                      const odd = row.perDay != null && mean != null && mean > 0 && (row.perDay > mean * 1.5 || row.perDay < 0);
                      return (
                        <tr key={row.id} className="border-t border-line/60" title={row.note ?? undefined}>
                          <td className="py-1">{fmtDate(row.read_on)}{row.note && <span className="text-muted"> *</span>}</td>
                          <td className="text-right tabular-nums">{n(row.value)}</td>
                          <td className={`text-right tabular-nums ${odd ? "text-warn font-semibold" : ""}`}>{row.used != null ? n(row.used) : "–"}</td>
                          <td className={`text-right tabular-nums ${odd ? "text-warn font-semibold" : "text-muted"}`}>{row.perDay != null ? n(row.perDay, 1) : ""}</td>
                          <td className="text-right w-6">
                            {editor && <form action={deleteReading.bind(null, row.id)}><button className="text-muted hover:text-warn" type="submit" aria-label="Ta bort avläsningen">×</button></form>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted">Inga avläsningar än.</p>}
              {mean != null && <p className="text-xs text-muted">Snitt {n(mean, 1)} {x.unit} per dag. Ovanligt hög förbrukning markeras.</p>}
              {editor && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">Ändra mätaren</summary>
                  <MeterForm meter={x} />
                </details>
              )}
            </section>
          );
        })}
      </div>

      {editor && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Ny mätare</summary>
          <MeterForm />
        </details>
      )}
    </div>
  );
}

function MeterForm({ meter }: { meter?: Meter }) {
  const k = meter?.id ?? "ny";
  return (
    <form action={saveMeter.bind(null, meter?.id ?? null)} className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="field sm:col-span-2"><label className="label" htmlFor={`m-name-${k}`}>Namn</label><input className="input" id={`m-name-${k}`} name="name" required defaultValue={meter?.name} /></div>
      <div className="field"><label className="label" htmlFor={`m-kind-${k}`}>Slag</label>
        <select className="input" id={`m-kind-${k}`} name="kind" defaultValue={meter?.kind ?? "el"}>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><label className="label" htmlFor={`m-unit-${k}`}>Enhet</label><input className="input" id={`m-unit-${k}`} name="unit" defaultValue={meter?.unit ?? "kWh"} /></div>
      <div className="field"><label className="label" htmlFor={`m-loc-${k}`}>Plats</label><input className="input" id={`m-loc-${k}`} name="location" defaultValue={meter?.location ?? ""} /></div>
      <div className="field"><label className="label" htmlFor={`m-no-${k}`}>Mätarnummer</label><input className="input" id={`m-no-${k}`} name="meter_no" defaultValue={meter?.meter_no ?? ""} /></div>
      {meter && (
        <div className="field"><label className="label" htmlFor={`m-act-${k}`}>Status</label>
          <select className="input" id={`m-act-${k}`} name="active" defaultValue={meter.active ? "on" : "off"}><option value="on">Används</option><option value="off">Borttagen</option></select></div>
      )}
      <div className="sm:col-span-3"><button className="btn" type="submit">{meter ? "Spara" : "Lägg till"}</button></div>
    </form>
  );
}

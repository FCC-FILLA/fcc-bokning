import { isAdmin, requireProfile } from "@/lib/auth";
import { loadFurniture } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { saveFurniture } from "../../mobleringar/actions";

const SHAPE: Record<string, string> = { rect: "Rektangel", round: "Rund", chair: "Stol", fixed: "Fast del" };

export default async function FurniturePage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const types = await loadFurniture(await createClient());
  return (
    <div className="grid gap-4 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Möbler och inventarier</h1>
        <p className="text-sm text-muted">
          Måtten används i ritverktyget. Fyll i hur många ni har i lager, så varnar ritningen när en uppställning kräver fler än ni äger.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      <form action={saveFurniture} className="card p-0 overflow-x-auto">
        <fieldset disabled={!admin}>
          <table className="w-full text-sm">
            <thead className="bg-sunk text-left">
              <tr>
                <th className="px-3 py-2">Namn</th><th className="px-2">Form</th><th className="px-2">Bredd m</th><th className="px-2">Djup m</th>
                <th className="px-2">Stolar</th><th className="px-2">Max stolar</th><th className="px-2">I lager</th><th className="px-2">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-3 py-1.5"><input type="hidden" name="id" value={t.id} /><input className="input h-8" name={`name_${t.id}`} defaultValue={t.name} aria-label="Namn" /></td>
                  <td className="px-2 text-muted">{SHAPE[t.shape]}</td>
                  <td className="px-2"><input className="input h-8 w-20" name={`w_${t.id}`} defaultValue={t.width_m} inputMode="decimal" aria-label={`Bredd ${t.name}`} /></td>
                  <td className="px-2"><input className="input h-8 w-20" name={`d_${t.id}`} defaultValue={t.depth_m} inputMode="decimal" aria-label={`Djup ${t.name}`} /></td>
                  <td className="px-2">{t.shape === "rect" || t.shape === "round" ? <input className="input h-8 w-16" name={`chairs_${t.id}`} defaultValue={t.default_chairs} inputMode="numeric" aria-label={`Stolar ${t.name}`} /> : null}</td>
                  <td className="px-2">{t.shape === "rect" || t.shape === "round" ? <input className="input h-8 w-16" name={`max_${t.id}`} defaultValue={t.max_chairs} inputMode="numeric" aria-label={`Max stolar ${t.name}`} /> : null}</td>
                  <td className="px-2">{t.shape !== "fixed" ? <input className="input h-8 w-20" name={`stock_${t.id}`} defaultValue={t.stock ?? ""} placeholder="–" inputMode="numeric" aria-label={`Lager ${t.name}`} /> : null}</td>
                  <td className="px-2"><input type="checkbox" name={`active_${t.id}`} defaultChecked={t.active} aria-label={`Aktiv ${t.name}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {admin && <div className="p-3"><button className="btn btn-primary" type="submit">Spara</button></div>}
        </fieldset>
      </form>
    </div>
  );
}

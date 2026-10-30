import { isAdmin, requireProfile } from "@/lib/auth";
import { loadFurniture } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LegendSymbol } from "@/components/layout-legend";
import { createFurniture, saveFurniture } from "../../mobleringar/actions";

const SHAPE: Record<string, string> = { rect: "Rektangel", round: "Rund", chair: "Stol", fixed: "Fast del" };

export default async function FurniturePage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string; skapad?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const types = await loadFurniture(await createClient());
  return (
    <div className="grid gap-4 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Möbler och inventarier</h1>
        <p className="text-sm text-muted">
          Måtten används i ritverktyget. Lagersaldot kommer från inventarielistan. Ritningen varnar när en uppställning kräver fler än ni äger. Möbler som hyrs in (t.ex. från Westmans) får leverantören ifylld och räknas inte mot lagret.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {sp.skapad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Objektet är tillagt och finns nu i ritverktyget.</p>}
      <form action={saveFurniture} className="card p-0 overflow-x-auto">
        <fieldset disabled={!admin}>
          <table className="w-full text-sm">
            <thead className="bg-sunk text-left">
              <tr>
                <th className="px-3 py-2">Namn</th><th className="px-2">Form</th><th className="px-2">Bredd m</th><th className="px-2">Djup m</th>
                <th className="px-2">Stolar</th><th className="px-2">Max stolar</th><th className="px-2">I lager</th><th className="px-2">Leverantör</th><th className="px-2">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-3 py-1.5"><span className="flex items-center gap-2"><LegendSymbol shape={t.shape} color={t.color} chairs={t.default_chairs} size={24} /><input type="hidden" name="id" value={t.id} /><input className="input h-8" name={`name_${t.id}`} defaultValue={t.name} aria-label="Namn" /></span></td>
                  <td className="px-2 text-muted">{SHAPE[t.shape]}</td>
                  <td className="px-2"><input className="input h-8 w-20" name={`w_${t.id}`} defaultValue={t.width_m} inputMode="decimal" aria-label={`Bredd ${t.name}`} /></td>
                  <td className="px-2"><input className="input h-8 w-20" name={`d_${t.id}`} defaultValue={t.depth_m} inputMode="decimal" aria-label={`Djup ${t.name}`} /></td>
                  <td className="px-2">{t.shape === "rect" || t.shape === "round" ? <input className="input h-8 w-16" name={`chairs_${t.id}`} defaultValue={t.default_chairs} inputMode="numeric" aria-label={`Stolar ${t.name}`} /> : null}</td>
                  <td className="px-2">{t.shape === "rect" || t.shape === "round" ? <input className="input h-8 w-16" name={`max_${t.id}`} defaultValue={t.max_chairs} inputMode="numeric" aria-label={`Max stolar ${t.name}`} /> : null}</td>
                  <td className="px-2">{t.shape !== "fixed" ? <input className="input h-8 w-20" name={`stock_${t.id}`} defaultValue={t.stock ?? ""} placeholder="–" inputMode="numeric" aria-label={`Lager ${t.name}`} /> : null}</td>
                  <td className="px-2">{t.shape !== "fixed" ? <input className="input h-8 w-28" name={`supplier_${t.id}`} defaultValue={t.supplier ?? ""} placeholder="eget" aria-label={`Leverantör ${t.name}`} /> : null}</td>
                  <td className="px-2"><input type="checkbox" name={`active_${t.id}`} defaultChecked={t.active} aria-label={`Aktiv ${t.name}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {admin && <div className="p-3"><button className="btn btn-primary" type="submit">Spara</button></div>}
        </fieldset>
      </form>

      {admin && (
        <form id="nytt" action={createFurniture} className="card p-4 grid gap-3 scroll-mt-28">
          <div>
            <h2 className="font-semibold">Nytt objekt</h2>
            <p className="text-sm text-muted">T.ex. ett runt bord Ø160 som hyrs från Westmans, ett podium eller en bardisk. Objektet blir valbart i ritverktyget direkt och syns i teckenförklaringen med storlek och leverantör.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="field sm:col-span-2"><label className="label" htmlFor="nf-name">Namn</label>
              <input className="input" id="nf-name" name="name" required placeholder="Runt bord Ø160 (Westmans)" /></div>
            <div className="field"><label className="label" htmlFor="nf-shape">Form</label>
              <select className="input" id="nf-shape" name="shape" defaultValue="round">
                <option value="round">Runt bord</option><option value="rect">Rektangulärt bord</option><option value="chair">Stol</option><option value="fixed">Fast del / övrigt</option>
              </select></div>
            <div className="field"><label className="label" htmlFor="nf-color">Färg på ritningen</label>
              <input className="input h-10 p-1" id="nf-color" name="color" type="color" defaultValue="#ffffff" /></div>
            <div className="field"><label className="label" htmlFor="nf-w">Bredd / diameter (cm)</label>
              <input className="input" id="nf-w" name="w_cm" required inputMode="decimal" placeholder="160" /></div>
            <div className="field"><label className="label" htmlFor="nf-d">Djup (cm, ej runda)</label>
              <input className="input" id="nf-d" name="d_cm" inputMode="decimal" placeholder="80" /></div>
            <div className="field"><label className="label" htmlFor="nf-ch">Stolar runt</label>
              <input className="input" id="nf-ch" name="chairs" inputMode="numeric" placeholder="10" /></div>
            <div className="field"><label className="label" htmlFor="nf-max">Max stolar</label>
              <input className="input" id="nf-max" name="max" inputMode="numeric" placeholder="12" /></div>
            <div className="field"><label className="label" htmlFor="nf-stock">I lager</label>
              <input className="input" id="nf-stock" name="stock" inputMode="numeric" placeholder="tomt = obegränsat" /></div>
            <div className="field"><label className="label" htmlFor="nf-sup">Leverantör</label>
              <input className="input" id="nf-sup" name="supplier" placeholder="tomt = eget (FCC)" /></div>
          </div>
          <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
        </form>
      )}
    </div>
  );
}

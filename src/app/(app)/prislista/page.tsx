import Link from "next/link";
import { isAdmin, requireProfile } from "@/lib/auth";
import { fmtKr } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import type { Article, ArticleGroup, Room } from "@/lib/types";
import { createArticle, saveSetting, updateArticle } from "./actions";

export const metadata = { title: "Prislista" };

const UNITS = ["st", "dag", "tim", "person", "m2", "paket"];

export default async function PriceListPage({
  searchParams,
}: {
  searchParams: Promise<{ grupp?: string; q?: string; vy?: string; fel?: string; sparad?: string; saknar?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const admin = isAdmin(profile);
  const supabase = await createClient();

  const [{ data: g }, { data: a }, { data: r }, { data: s }] = await Promise.all([
    supabase.from("article_groups").select("*").order("sort_order"),
    supabase.from("articles").select("*").order("sort_order"),
    supabase.from("rooms").select("id, name, sort_order").eq("active", true).order("sort_order"),
    supabase.from("app_settings").select("*"),
  ]);
  const groups = (g ?? []) as ArticleGroup[];
  const all = (a ?? []) as Article[];
  const rooms = (r ?? []) as Pick<Room, "id" | "name">[];
  const settings = new Map(((s ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));

  const group = groups.some((x) => x.id === sp.grupp) ? sp.grupp! : "";
  const q = (sp.q ?? "").trim().toLowerCase();
  const missing = sp.saknar === "1";
  const list = all.filter(
    (x) =>
      (!group || x.group_id === group) &&
      (!q || x.name.toLowerCase().includes(q) || (x.article_no ?? "").includes(q)) &&
      (!missing || x.price == null),
  );
  const missingCount = all.filter((x) => x.price == null && x.active).length;
  const keep = new URLSearchParams({ ...(group && { grupp: group }), ...(q && { q }), ...(missing && { saknar: "1" }) }).toString();
  const groupName = new Map(groups.map((x) => [x.id, x.name]));

  if (sp.vy === "villkor") {
    return (
      <>
        <Header admin={admin} vy="villkor" />
        {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
        <div className="grid gap-5 max-w-3xl">
          {[
            { key: "quote_intro", label: "Inledning", help: "Visas överst i varje ny offert." },
            { key: "quote_terms", label: "Villkor", help: "Kopieras in i varje ny offert och kan ändras per offert." },
            { key: "quote_valid_days", label: "Giltighet i dagar", help: "Hur länge en ny offert gäller från att den skapas." },
          ].map((x) => (
            <form key={x.key} action={saveSetting.bind(null, x.key)} className="card p-5 grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">{x.label}</h2>
                <p className="text-sm text-muted">{x.help}</p>
              </div>
              {x.key === "quote_valid_days" ? (
                <input className="input w-32" name="value" type="number" min={1} defaultValue={settings.get(x.key) ?? "30"} disabled={!admin} aria-label={x.label} />
              ) : (
                <textarea className="input min-h-40" name="value" defaultValue={settings.get(x.key) ?? ""} disabled={!admin} aria-label={x.label} />
              )}
              {admin && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
            </form>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Header admin={admin} vy="artiklar" />
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.sparad} är sparad.</p>}
      {missingCount > 0 && !missing && (
        <p className="text-sm text-muted">
          {missingCount} aktiva artiklar saknar pris.{" "}
          <Link className="underline underline-offset-2" href="/prislista?saknar=1">Visa dem</Link>
        </p>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="field w-60 max-w-full">
          <label className="label" htmlFor="q">Sök</label>
          <input className="input" id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Namn eller artikelnummer" />
        </div>
        <div className="field">
          <label className="label" htmlFor="grupp">Grupp</label>
          <select className="input" id="grupp" name="grupp" defaultValue={group}>
            <option value="">Alla grupper</option>
            {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" name="saknar" value="1" defaultChecked={missing} /> Bara utan pris
        </label>
        <button className="btn" type="submit">Visa</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table min-w-[1080px]">
          <thead>
            <tr>
              <th className="w-20">Art.nr</th>
              <th>Artikel</th>
              <th className="w-36">Grupp</th>
              <th className="w-24">Enhet</th>
              <th className="w-32 text-right">Pris exkl. moms</th>
              <th className="w-28 text-right">Kostnad</th>
              <th className="w-20 text-right">Moms %</th>
              <th className="w-20">Aktiv</th>
              {admin && <th className="w-20" />}
            </tr>
          </thead>
          <tbody>
            {list.map((x) =>
              admin ? (
                <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                  <td colSpan={9} className="p-0">
                    <form action={updateArticle.bind(null, x.id, keep)} className="grid grid-cols-[80px_minmax(0,1fr)_144px_96px_128px_112px_80px_80px_80px] items-center gap-2 px-3 py-1.5">
                      <input className="input font-mono text-sm" name="article_no" defaultValue={x.article_no ?? ""} aria-label="Artikelnummer" />
                      <div className="grid gap-1 min-w-0">
                        <input className="input" name="name" defaultValue={x.name} aria-label="Namn" required />
                        {x.group_id === "lokal" && (
                          <select className="input text-xs py-1" name="room_id" defaultValue={x.room_id ?? ""} aria-label="Kopplad lokal">
                            <option value="">Ingen kopplad lokal</option>
                            {rooms.map((r) => <option key={r.id} value={r.id}>Föreslås för {r.name}</option>)}
                          </select>
                        )}
                      </div>
                      <select className="input" name="group_id" defaultValue={x.group_id} aria-label="Grupp">
                        {groups.map((g2) => <option key={g2.id} value={g2.id}>{g2.name}</option>)}
                      </select>
                      <select className="input" name="unit" defaultValue={x.unit} aria-label="Enhet">
                        {[...new Set([...UNITS, x.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input className={`input text-right ${x.price == null ? "border-st-preliminar" : ""}`} name="price" inputMode="decimal" defaultValue={x.price ?? ""} placeholder="Saknas" aria-label="Pris" />
                      <input className="input text-right" name="cost" inputMode="decimal" defaultValue={x.cost} aria-label="Kostnad" />
                      <input className="input text-right" name="vat_rate" inputMode="decimal" defaultValue={x.vat_rate} aria-label="Moms" />
                      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={x.active} /> Ja</label>
                      <button className="btn text-sm" type="submit">Spara</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                  <td className="font-mono text-sm">{x.article_no}</td>
                  <td>{x.name}</td>
                  <td>{groupName.get(x.group_id)}</td>
                  <td>{x.unit}</td>
                  <td className="text-right">{x.price == null ? <span className="text-muted">Saknas</span> : fmtKr(Number(x.price))}</td>
                  <td className="text-right">{fmtKr(Number(x.cost))}</td>
                  <td className="text-right">{Number(x.vat_rate)}</td>
                  <td>{x.active ? "Ja" : "Nej"}</td>
                </tr>
              ),
            )}
            {list.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted py-8">Inga artiklar matchar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {admin && (
        <form action={createArticle} className="card p-5 grid gap-3 max-w-4xl">
          <h2 className="text-lg font-semibold">Ny artikel</h2>
          <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)_160px]">
            <div className="field"><label className="label" htmlFor="n-no">Art.nr</label><input className="input" id="n-no" name="article_no" /></div>
            <div className="field"><label className="label" htmlFor="n-name">Namn</label><input className="input" id="n-name" name="name" required /></div>
            <div className="field">
              <label className="label" htmlFor="n-group">Grupp</label>
              <select className="input" id="n-group" name="group_id" defaultValue={group || "ovrigt"}>
                {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="field">
              <label className="label" htmlFor="n-unit">Enhet</label>
              <select className="input" id="n-unit" name="unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
            </div>
            <div className="field"><label className="label" htmlFor="n-price">Pris exkl. moms</label><input className="input" id="n-price" name="price" inputMode="decimal" /></div>
            <div className="field"><label className="label" htmlFor="n-cost">Kostnad</label><input className="input" id="n-cost" name="cost" inputMode="decimal" defaultValue="0" /></div>
            <div className="field"><label className="label" htmlFor="n-vat">Moms %</label><input className="input" id="n-vat" name="vat_rate" inputMode="decimal" defaultValue="25" /></div>
          </div>
          <div><button className="btn btn-primary" type="submit">Lägg till artikel</button></div>
        </form>
      )}
    </>
  );
}

function Header({ admin, vy }: { admin: boolean; vy: "artiklar" | "villkor" }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-semibold">Prislista</h1>
      <nav className="flex gap-1">
        <Link href="/prislista" className={`btn ${vy === "artiklar" ? "btn-primary" : ""}`}>Artiklar</Link>
        <Link href="/prislista?vy=villkor" className={`btn ${vy === "villkor" ? "btn-primary" : ""}`}>Offerttexter</Link>
      </nav>
      <span className="flex-1" />
      {!admin && <span className="text-sm text-muted">Bara administratörer kan ändra prislistan.</span>}
    </div>
  );
}

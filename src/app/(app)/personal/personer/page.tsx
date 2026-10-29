import Link from "next/link";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtKr } from "@/lib/offert";
import { KIND_LABEL, type Staff, type StaffKind } from "@/lib/personal";
import { getStaffLookups } from "@/lib/personal-data";
import { createClient } from "@/lib/supabase/server";
import { createStaff } from "../actions";

export const metadata = { title: "Personer" };

type Row = Staff & { staff_skills: { function_id: string }[] };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ typ?: string; q?: string; fel?: string; inaktiva?: string }> }) {
  const sp = await searchParams;
  const manager = canManageStaff(await requireProfile());
  const kind = (["intern", "frilans", "leverantor"] as StaffKind[]).includes(sp.typ as StaffKind) ? (sp.typ as StaffKind) : null;
  const supabase = await createClient();
  const { functions } = await getStaffLookups();
  let q = supabase.from("staff").select("*, staff_skills(function_id)").order("name");
  if (kind) q = q.eq("kind", kind);
  if (!sp.inaktiva) q = q.eq("active", true);
  const { data } = await q;
  const needle = (sp.q ?? "").trim().toLowerCase();
  const people = ((data ?? []) as Row[]).filter(
    (p) => !needle || [p.name, p.email, p.company, p.phone].some((v) => v?.toLowerCase().includes(needle)),
  );
  const fnName = new Map(functions.map((f) => [f.id, f]));

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Personer</h1>
        <p className="text-sm text-muted max-w-3xl">
          Internpersonal loggar in i personalportalen. Frilansare och leverantörer får en personlig länk utan inloggning. Funktionerna styr vilka pass
          personen kan söka eller bjudas in till.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <nav className="flex gap-1" aria-label="Typ">
          {[null, "intern", "frilans", "leverantor"].map((k) => (
            <Link
              key={k ?? "alla"}
              href={k ? `/personal/personer?typ=${k}` : "/personal/personer"}
              className={`btn ${kind === k ? "btn-primary" : ""}`}
            >
              {k ? (k === "leverantor" ? "Leverantörer" : k === "frilans" ? "Frilans" : "Intern") : "Alla"}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex gap-2 items-end">
          {kind && <input type="hidden" name="typ" value={kind} />}
          <input className="input w-56" name="q" defaultValue={sp.q ?? ""} placeholder="Sök namn, e-post, företag" aria-label="Sök" />
          <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="inaktiva" value="1" defaultChecked={!!sp.inaktiva} /> Visa inaktiva</label>
          <button className="btn" type="submit">Sök</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[820px]">
          <thead>
            <tr><th>Namn</th><th>Typ</th><th>Funktioner</th><th>Kontakt</th><th className="text-right">Timpris</th><th>Portal</th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                <td>
                  <Link href={`/personal/personer/${p.id}`} className="font-medium hover:underline underline-offset-2">{p.name}</Link>
                  {p.company && <span className="block text-xs text-muted">{p.company}</span>}
                </td>
                <td>{KIND_LABEL[p.kind]}</td>
                <td>
                  <span className="flex flex-wrap gap-1">
                    {p.staff_skills.map((s) => fnName.get(s.function_id)).filter(Boolean).map((f) => (
                      <span key={f!.id} className="rounded-full px-2 text-xs text-white" style={{ background: f!.color }}>{f!.name}</span>
                    ))}
                  </span>
                </td>
                <td className="text-sm">
                  {p.email && <span className="block">{p.email}</span>}
                  {p.phone && <span className="block text-muted">{p.phone}</span>}
                </td>
                <td className="text-right tabular-nums">{p.hourly_rate != null ? fmtKr(Number(p.hourly_rate)) : <span className="text-muted">funktionens</span>}</td>
                <td className="text-sm">{p.kind === "intern" ? (p.profile_id ? "Har konto" : <span className="text-muted">Ej inbjuden</span>) : "Länk"}</td>
              </tr>
            ))}
            {!people.length && <tr><td colSpan={6} className="text-center text-muted py-8">Inga personer här ännu.</td></tr>}
          </tbody>
        </table>
      </div>

      {manager && (
        <form action={createStaff} className="card p-5 grid gap-4 max-w-4xl">
          <h2 className="text-lg font-semibold">Ny person</h2>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
            <div className="field">
              <label className="label" htmlFor="kind">Typ</label>
              <select className="input" id="kind" name="kind" defaultValue={kind ?? "intern"}>
                <option value="intern">Intern</option>
                <option value="frilans">Frilans</option>
                <option value="leverantor">Leverantör</option>
              </select>
            </div>
            <div className="field"><label className="label" htmlFor="name">Namn (kontaktperson för leverantör)</label><input className="input" id="name" name="name" required /></div>
            <div className="field"><label className="label" htmlFor="company">Företag (leverantör/frilansbolag)</label><input className="input" id="company" name="company" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field"><label className="label" htmlFor="email">E-post</label><input className="input" id="email" name="email" type="email" /></div>
            <div className="field"><label className="label" htmlFor="phone">Mobil</label><input className="input" id="phone" name="phone" type="tel" /></div>
            <div className="field"><label className="label" htmlFor="hourly_rate">Eget timpris (valfritt)</label><input className="input" id="hourly_rate" name="hourly_rate" inputMode="decimal" placeholder="Funktionens" /></div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="label mb-1">Funktioner</legend>
            <div className="flex flex-wrap gap-2">
              {functions.filter((f) => f.active).map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="function_ids" value={f.id} /> {f.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
        </form>
      )}
    </div>
  );
}

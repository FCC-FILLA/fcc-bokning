import { isAdmin, requireProfile } from "@/lib/auth";
import { COMPANY_FIELDS, footerParts, loadCompany } from "@/lib/foretag";
import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "../actions";

export const metadata = { title: "Företagsuppgifter" };

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ sparad?: string; fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const company = await loadCompany(await createClient());

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Företagsuppgifter</h1>
        <p className="text-sm text-muted">Visas i offerten, i PDF:en och på kundens offertsida. Tomma fält visas inte.</p>
      </div>
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat. Gäller direkt i alla offerter, även de som redan är skickade.</p>}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <form action={saveCompany} className="grid gap-5">
        <fieldset disabled={!admin} className="card p-5 grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Företagsuppgifter</legend>
          {COMPANY_FIELDS.map((f) => (
            <div key={f.key} className="field">
              <label className="label" htmlFor={f.key}>{f.label}</label>
              <input
                className="input"
                id={f.key}
                name={f.key}
                defaultValue={company[f.key]}
                placeholder={f.placeholder}
                maxLength={200}
                required={f.key === "name"}
                type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "text"}
                autoComplete="off"
              />
              {f.help && <span className="text-xs text-muted">{f.help}</span>}
            </div>
          ))}
        </fieldset>
        {admin ? (
          <div><button className="btn btn-primary" type="submit">Spara</button></div>
        ) : (
          <p className="text-sm text-muted">Bara administratörer kan ändra företagsuppgifterna.</p>
        )}
      </form>

      <section className="grid gap-2">
        <h2 className="label">Så här ser sidfoten ut i offerten</h2>
        <div className="card p-4 text-xs text-muted grid gap-1">
          {footerParts(company).map((row, i) => <p key={i}>{row.join(" · ")}</p>)}
        </div>
      </section>
    </div>
  );
}

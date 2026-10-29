import type { Company } from "@/lib/types";
import { OrgLookup } from "@/components/org-lookup";
import { lookupOrgNr } from "@/app/(app)/kunder/actions";

export const DEFAULT_CATEGORIES = ["Direktkund", "Eventbyrå", "Arrangör", "Församling", "Underleverantör", "Drakudden", "Tyresö"];

export function CompanyFields({ company, disabled, categories = DEFAULT_CATEGORIES }: { company?: Partial<Company>; disabled?: boolean; categories?: string[] }) {
  const cats = [...new Set([...categories, ...(company?.categories ?? [])])];
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <div className="field sm:col-span-2">
        <label className="label" htmlFor="name">Namn</label>
        <input className="input" id="name" name="name" required defaultValue={company?.name ?? ""} />
      </div>
      <OrgLookup defaultValue={company?.org_nr} lookup={lookupOrgNr} />
      <div className="field">
        <label className="label" htmlFor="invoice_reference">Fakturareferens</label>
        <input className="input" id="invoice_reference" name="invoice_reference" defaultValue={company?.invoice_reference ?? ""} />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">E-post</label>
        <input className="input" id="email" name="email" type="email" defaultValue={company?.email ?? ""} />
      </div>
      <div className="field">
        <label className="label" htmlFor="phone">Telefon</label>
        <input className="input" id="phone" name="phone" type="tel" defaultValue={company?.phone ?? ""} />
      </div>
      <div className="field sm:col-span-2">
        <label className="label" htmlFor="address">Adress</label>
        <input className="input" id="address" name="address" defaultValue={company?.address ?? ""} />
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <div className="field">
          <label className="label" htmlFor="postal_code">Postnr</label>
          <input className="input" id="postal_code" name="postal_code" defaultValue={company?.postal_code ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="city">Ort</label>
          <input className="input" id="city" name="city" defaultValue={company?.city ?? ""} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="country">Land</label>
        <input className="input" id="country" name="country" defaultValue={company?.country ?? ""} placeholder="Sverige" />
      </div>
      <div className="field">
        <label className="label" htmlFor="website">Webbplats</label>
        <input className="input" id="website" name="website" defaultValue={company?.website ?? ""} />
      </div>
      <div className="field">
        <label className="label" htmlFor="invoice_email">Fakturamejl</label>
        <input className="input" id="invoice_email" name="invoice_email" type="email" defaultValue={company?.invoice_email ?? ""} />
      </div>
      <fieldset className="sm:col-span-2 grid gap-2">
        <legend className="label mb-1">Kategori</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {cats.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="categories" value={c} defaultChecked={company?.categories?.includes(c)} /> {c}
            </label>
          ))}
          <input className="input h-8 w-40 py-1 text-sm" name="new_category" placeholder="+ ny kategori" aria-label="Ny kategori" />
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="invoice_address">Fakturaadress (om annan)</label>
        <textarea className="input" id="invoice_address" name="invoice_address" defaultValue={company?.invoice_address ?? ""} />
      </div>
      <div className="field">
        <label className="label" htmlFor="notes">Anteckningar</label>
        <textarea className="input" id="notes" name="notes" defaultValue={company?.notes ?? ""} />
      </div>
      <fieldset className="sm:col-span-2 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-[140px_1fr]">
        <legend className="px-1 text-sm font-semibold">Provision</legend>
        <div className="field">
          <label className="label" htmlFor="commission_pct">Procent</label>
          <input className="input text-right" id="commission_pct" name="commission_pct" inputMode="decimal" defaultValue={company?.commission_pct ?? ""} placeholder="Ingen" />
        </div>
        <div className="field">
          <label className="label" htmlFor="commission_to">Till vem</label>
          <input className="input" id="commission_to" name="commission_to" defaultValue={company?.commission_to ?? ""} placeholder="T.ex. eventbyrån som förmedlat kunden" />
        </div>
        <div className="field sm:col-span-2">
          <label className="label" htmlFor="commission_note">Villkor och notering</label>
          <input className="input" id="commission_note" name="commission_note" defaultValue={company?.commission_note ?? ""} placeholder="T.ex. på lokalhyra exkl. moms, faktureras efter evenemanget" />
          <span className="text-xs text-muted">Visas som påminnelse när någon gör en offert till kunden.</span>
        </div>
      </fieldset>
    </fieldset>
  );
}

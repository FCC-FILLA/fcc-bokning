import type { Company } from "@/lib/types";

export function CompanyFields({ company, disabled }: { company?: Partial<Company>; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <div className="field sm:col-span-2">
        <label className="label" htmlFor="name">Namn</label>
        <input className="input" id="name" name="name" required defaultValue={company?.name ?? ""} />
      </div>
      <div className="field">
        <label className="label" htmlFor="org_nr">Organisationsnummer</label>
        <input className="input" id="org_nr" name="org_nr" defaultValue={company?.org_nr ?? ""} />
      </div>
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
      <div className="field">
        <label className="label" htmlFor="invoice_address">Fakturaadress</label>
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

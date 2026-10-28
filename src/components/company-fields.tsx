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
    </fieldset>
  );
}

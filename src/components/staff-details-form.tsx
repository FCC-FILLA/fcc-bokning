export type StaffDetails = {
  name?: string; email?: string | null; phone?: string | null; kind?: string;
  address?: string | null; postal_code?: string | null; city?: string | null;
  ice_name?: string | null; ice_phone?: string | null; ice_relation?: string | null;
  bank_name?: string | null; tax_note?: string | null; company_name?: string | null; org_number?: string | null; f_tax?: boolean | null;
  food_preferences?: string | null; clothing_size?: string | null; drivers_license?: boolean | null; languages?: string | null; other?: string | null;
  personal_number_masked?: string | null; account_masked?: string | null; clearing_masked?: string | null; updated_at?: string;
};

function F({ name, label, value, type = "text", placeholder, wide, autoComplete }: { name: string; label: string; value?: string | null; type?: string; placeholder?: string; wide?: boolean; autoComplete?: string }) {
  return (
    <div className={`field ${wide ? "sm:col-span-2" : ""}`}>
      <label className="label" htmlFor={`d-${name}`}>{label}</label>
      <input className="input" id={`d-${name}`} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}

/** Formulär där personalen fyller i sina egna uppgifter (portalen och den personliga länken). */
export function StaffDetailsForm({ d, action }: { d: StaffDetails; action: (fd: FormData) => Promise<void> }) {
  const supplier = d.kind === "leverantor";
  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="font-semibold mb-2">Kontakt</legend>
        <F name="phone" label="Mobil" value={d.phone} type="tel" autoComplete="tel" />
        <F name="email" label="E-post" value={d.email} type="email" autoComplete="email" />
        <F name="address" label="Gatuadress" value={d.address} wide autoComplete="street-address" />
        <F name="postal_code" label="Postnummer" value={d.postal_code} autoComplete="postal-code" />
        <F name="city" label="Ort" value={d.city} autoComplete="address-level2" />
      </fieldset>

      {!supplier && (
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="font-semibold mb-2">Närmast anhörig (ICE)</legend>
          <F name="ice_name" label="Namn" value={d.ice_name} />
          <F name="ice_phone" label="Telefon" value={d.ice_phone} type="tel" />
          <F name="ice_relation" label="Relation" value={d.ice_relation} placeholder="T.ex. partner, förälder" />
        </fieldset>
      )}

      {!supplier && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="font-semibold mb-2">Lön och utbetalning</legend>
          <p className="sm:col-span-2 -mt-1 text-xs text-muted">
            Personnummer och kontonummer visas bara för administratörer. Det du redan sparat visas dolt; skriv bara i fälten om du vill ändra.
          </p>
          <F name="personal_number" label="Personnummer" placeholder={d.personal_number_masked ?? "ÅÅÅÅMMDD-XXXX"} />
          <F name="bank_name" label="Bank" value={d.bank_name} />
          <F name="clearing_number" label="Clearingnummer" placeholder={d.clearing_masked ?? ""} />
          <F name="account_number" label="Kontonummer" placeholder={d.account_masked ?? ""} />
          <F name="tax_note" label="Skatt" value={d.tax_note} placeholder="T.ex. huvudinkomst, sidoinkomst 30 %, jämkning" wide />
        </fieldset>
      )}

      {d.kind !== "intern" && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="font-semibold mb-2">Eget företag</legend>
          <F name="company_name" label="Företagsnamn" value={d.company_name} />
          <F name="org_number" label="Organisationsnummer" value={d.org_number} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="f_tax" defaultChecked={!!d.f_tax} /> Godkänd för F-skatt</label>
        </fieldset>
      )}

      {!supplier && (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="font-semibold mb-2">Bra att veta</legend>
          <F name="food_preferences" label="Specialkost" value={d.food_preferences} placeholder="T.ex. vegetarisk, glutenfri" />
          <F name="clothing_size" label="Klädstorlek (arbetskläder)" value={d.clothing_size} placeholder="T.ex. M" />
          <F name="languages" label="Språk" value={d.languages} placeholder="T.ex. svenska, engelska" />
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" name="drivers_license" defaultChecked={!!d.drivers_license} /> Har B-körkort</label>
          <div className="field sm:col-span-2">
            <label className="label" htmlFor="d-other">Övrigt</label>
            <textarea className="input min-h-20" id="d-other" name="other" defaultValue={d.other ?? ""} placeholder="Något annat vi bör veta" />
          </div>
        </fieldset>
      )}

      <div><button className="btn btn-primary" type="submit">Spara mina uppgifter</button></div>
    </form>
  );
}

/** Fälten som skickas till databasen. */
export const DETAIL_FIELDS = [
  "phone", "email", "address", "postal_code", "city", "ice_name", "ice_phone", "ice_relation", "personal_number", "bank_name",
  "clearing_number", "account_number", "tax_note", "company_name", "org_number", "f_tax", "food_preferences", "clothing_size",
  "drivers_license", "languages", "other",
];
export const detailsFromForm = (fd: FormData) => Object.fromEntries(DETAIL_FIELDS.map((k) => [k, String(fd.get(k) ?? "").slice(0, 500)]));

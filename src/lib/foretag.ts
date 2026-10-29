import type { SupabaseClient } from "@supabase/supabase-js";

/** Företagsuppgifter. Lagras i app_settings som company_<fält>. */
export type Company = {
  name: string;
  legal_name: string;
  orgnr: string;
  vat_no: string;
  address: string;
  postal: string;
  phone: string;
  email: string;
  web: string;
  bankgiro: string;
};

export const COMPANY_FIELDS: { key: keyof Company; label: string; placeholder?: string; help?: string; wide?: boolean }[] = [
  { key: "name", label: "Namn", placeholder: "Filadelfia Convention Center", help: "Visas överst i offerten och på kundsidan." },
  { key: "legal_name", label: "Juridiskt namn", placeholder: "Filadelfia Convention Center AB" },
  { key: "orgnr", label: "Organisationsnummer", placeholder: "556xxx-xxxx" },
  { key: "vat_no", label: "Momsregistreringsnummer", placeholder: "SE556xxxxxxx01" },
  { key: "address", label: "Gatuadress", placeholder: "Rörstrandsgatan 5" },
  { key: "postal", label: "Postnummer och ort", placeholder: "113 40 Stockholm" },
  { key: "phone", label: "Telefon", placeholder: "08-…" },
  { key: "email", label: "E-post", placeholder: "info@…" },
  { key: "web", label: "Webbplats", placeholder: "filadelfiaconventioncenter.se" },
  { key: "bankgiro", label: "Bankgiro", placeholder: "123-4567" },
];

export const DEFAULT_COMPANY: Company = {
  name: "Filadelfia Convention Center",
  legal_name: "Filadelfia Convention Center AB",
  orgnr: "",
  vat_no: "",
  address: "Rörstrandsgatan 5",
  postal: "Stockholm",
  phone: "",
  email: "",
  web: "",
  bankgiro: "",
};

export function toCompany(raw: Partial<Record<string, unknown>> | null | undefined): Company {
  const out = { ...DEFAULT_COMPANY };
  for (const f of COMPANY_FIELDS) {
    const v = raw?.[f.key];
    if (typeof v === "string") out[f.key] = v.trim();
  }
  if (!out.name) out.name = out.legal_name || DEFAULT_COMPANY.name;
  if (!out.legal_name) out.legal_name = out.name;
  return out;
}

/** Hämtar uppgifterna via databasfunktionen public_company() (fungerar även utloggad). */
export async function loadCompany(supabase: SupabaseClient): Promise<Company> {
  const { data } = await supabase.rpc("public_company");
  return toCompany(data as Record<string, unknown> | null);
}

/** "Rörstrandsgatan 5, 113 40 Stockholm" */
export const addressLine = (c: Company) => [c.address, c.postal].filter(Boolean).join(", ");

/** Sidfotens rader: juridiskt namn och adress, sedan kontakt, sedan org.nr, moms och bankgiro. */
export function footerParts(c: Company, lang: "sv" | "en" = "sv") {
  const L = lang === "en" ? { org: "Reg. no.", vat: "VAT no." } : { org: "Org.nr", vat: "Momsreg.nr" };
  return [
    [c.legal_name, addressLine(c)],
    [c.phone, c.email, c.web],
    [c.orgnr && `${L.org} ${c.orgnr}`, c.vat_no && `${L.vat} ${c.vat_no}`, c.bankgiro && `Bankgiro ${c.bankgiro}`],
  ].map((row) => row.filter(Boolean) as string[]).filter((row) => row.length > 0);
}

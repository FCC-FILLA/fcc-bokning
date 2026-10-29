import "server-only";

/**
 * Uppslag av företag på organisationsnummer via Bolagsverkets API för värdefulla datamängder (gratis, kräver registrering).
 * Aktiveras när BOLAGSVERKET_CLIENT_ID och BOLAGSVERKET_CLIENT_SECRET finns i Vercel.
 */
export type OrgInfo = { name?: string; org_nr: string; address?: string; postal_code?: string; city?: string; legal_form?: string; active?: boolean };

const ID = process.env.BOLAGSVERKET_CLIENT_ID;
const SECRET = process.env.BOLAGSVERKET_CLIENT_SECRET;
export const orgLookupEnabled = !!(ID && SECRET);

let cached: { token: string; until: number } | null = null;

async function token() {
  if (cached && cached.until > Date.now()) return cached.token;
  for (const url of ["https://portal.api.bolagsverket.se/oauth2/token", "https://gw.api.bolagsverket.se/oauth2/token"]) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: ID!, client_secret: SECRET!, scope: "vardefulla-datamangder:read" }),
      cache: "no-store",
    }).catch(() => null);
    if (res?.ok) {
      const j = (await res.json()) as { access_token: string; expires_in?: number };
      cached = { token: j.access_token, until: Date.now() + ((j.expires_in ?? 3000) - 60) * 1000 };
      return cached.token;
    }
  }
  throw new Error("token");
}

/** Hittar första värdet för någon av nycklarna var som helst i svaret. */
function find(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keys.includes(k) && (typeof v === "string" || typeof v === "number")) return String(v);
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const hit = find(v, keys);
    if (hit) return hit;
  }
  return undefined;
}

export const normalizeOrgNr = (s: string) => {
  const d = s.replace(/\D/g, "");
  const ten = d.length === 12 ? d.slice(2) : d;
  return ten.length === 10 ? `${ten.slice(0, 6)}-${ten.slice(6)}` : null;
};

export async function lookupOrg(orgNr: string): Promise<{ info?: OrgInfo; error?: string }> {
  const nr = normalizeOrgNr(orgNr);
  if (!nr) return { error: "Ange ett organisationsnummer med tio siffror." };
  if (!orgLookupEnabled) return { error: "Sökningen är inte påslagen ännu (nyckel från Bolagsverket saknas)." };
  try {
    const res = await fetch("https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identitetsbeteckning: nr.replace("-", "") }),
      cache: "no-store",
    });
    if (res.status === 404) return { error: "Hittade inget företag med det numret." };
    if (!res.ok) return { error: "Bolagsverket svarade inte. Försök igen om en stund." };
    const j = await res.json();
    const name = find(j, ["namn", "organisationsnamn", "foretagsnamn"]);
    if (!name) return { error: "Hittade inget företag med det numret." };
    return {
      info: {
        org_nr: nr,
        name,
        address: find(j, ["utdelningsadress", "gatuadress"]),
        postal_code: find(j, ["postnummer"]),
        city: find(j, ["postort"]),
        legal_form: find(j, ["klartext", "organisationsform"]),
      },
    };
  } catch {
    return { error: "Det gick inte att nå Bolagsverket." };
  }
}

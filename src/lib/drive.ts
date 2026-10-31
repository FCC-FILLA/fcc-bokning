import "server-only";
import { createSign } from "node:crypto";

// Google Drive via ett servicekonto. Nyckeln ligger i Vercel som GOOGLE_SERVICE_ACCOUNT_JSON och lämnar aldrig servern.

type Key = { client_email: string; private_key: string; token_uri?: string };

const FOLDER = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3/files";

export const driveConfigured = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const serviceAccountEmail = () => {
  try {
    return (JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "") as Key).client_email ?? null;
  } catch {
    return null;
  }
};

/** Mapp-id ur en länk eller ett id. */
export function parseFolderId(v: string): string | null {
  const s = v.trim();
  const m = s.match(/folders\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}

/** Namn som fungerar som mappnamn: inga snedstreck, inga radbrytningar, rimlig längd. */
export function cleanName(s: string): string {
  return s.replace(/[\\/\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Namnlös";
}

let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "") as Key;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/drive", aud: key.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key.private_key, "base64url");
  const res = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google-inloggningen misslyckades (${res.status}).`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function drive(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) throw new Error("Mappen hittades inte. Är huvudmappen delad med servicekontot?");
    if (res.status === 403) throw new Error(`Servicekontot saknar behörighet till mappen. ${text.slice(0, 200)}`);
    throw new Error(`Google Drive svarade ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Finns mappen kvar (och är inte i papperskorgen)? */
export async function folderExists(id: string): Promise<boolean> {
  try {
    const f = (await drive(`/${id}?fields=id,trashed&supportsAllDrives=true`)) as { trashed?: boolean };
    return !f.trashed;
  } catch {
    return false;
  }
}

/** Hämtar en undermapp med exakt detta namn, eller skapar den. */
export async function ensureFolder(parent: string, name: string): Promise<string> {
  const n = cleanName(name);
  const q = `'${parent}' in parents and name = '${n.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = '${FOLDER}' and trashed = false`;
  const found = (await drive(`?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`)) as { files: { id: string }[] };
  if (found.files[0]) return found.files[0].id;
  const made = (await drive(`?supportsAllDrives=true&fields=id`, { method: "POST", body: JSON.stringify({ name: n, mimeType: FOLDER, parents: [parent] }) })) as { id: string };
  return made.id;
}

/** Kontrollerar att huvudmappen går att nå och returnerar dess namn. */
export async function checkRoot(id: string): Promise<string> {
  const f = (await drive(`/${id}?fields=id,name,mimeType&supportsAllDrives=true`)) as { name: string; mimeType: string };
  if (f.mimeType !== FOLDER) throw new Error("Länken pekar inte på en mapp.");
  return f.name;
}

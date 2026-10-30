import { TZDate } from "@date-fns/tz";

// All tid lagras i UTC i databasen och visas i svensk tid.
export const TZ = "Europe/Stockholm";

const pad = (n: number) => String(n).padStart(2, "0");

/** Delar upp en tidpunkt i svensk lokal tid. */
function parts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** "2027-03-01T12:00" (svensk tid, som från <input type="datetime-local">) → ISO i UTC. */
export function localToIso(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Ogiltig tid: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, TZ).getTime()).toISOString();
}

/** ISO → "2027-03-01T12:00" i svensk tid. */
export function isoToLocal(iso: string): string {
  const p = parts(iso);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/** ISO → "2027-03-01" (svenskt datum). */
export function isoToDate(iso: string): string {
  const p = parts(iso);
  return `${p.y}-${p.m}-${p.d}`;
}

export function todayDate(): string {
  return isoToDate(new Date().toISOString());
}

/** Kalenderräkning på datumsträngar, oberoende av tidszon. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = måndag
}

export function mondayOf(date: string): string {
  return addDays(date, -weekday(date));
}

export function isoWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 864e5 + 1) / 7);
}

/** Start på dagen (00:00 svensk tid) som ISO. */
export function dayStartIso(date: string): string {
  return localToIso(`${date}T00:00`);
}

const DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const DAYS_LONG = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export const dayShort = (date: string) => DAYS[weekday(date)];
export const dayLong = (date: string) => DAYS_LONG[weekday(date)];

/** "1 mar" */
export function fmtDayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "mån 1 mar 2027" */
export function fmtDate(isoOrDate: string): string {
  const date = isoOrDate.length > 10 ? isoToDate(isoOrDate) : isoOrDate;
  return `${dayShort(date).toLowerCase()} ${fmtDayMonth(date)} ${date.slice(0, 4)}`;
}

/** "12:00" */
export function fmtTime(iso: string): string {
  const p = parts(iso);
  return `${p.h}:${p.min}`;
}

/** "mån 1 mar 2027, 12:00–23:00" eller med två datum om det spänner över flera dagar. */
export function fmtRange(startIso: string, endIso: string): string {
  const sd = isoToDate(startIso);
  const ed = isoToDate(endIso);
  if (sd === ed || (addDays(sd, 1) === ed && fmtTime(endIso) === "00:00")) {
    return `${fmtDate(sd)}, ${fmtTime(startIso)}–${fmtTime(endIso) === "00:00" ? "24:00" : fmtTime(endIso)}`;
  }
  return `${fmtDate(sd)} ${fmtTime(startIso)} – ${fmtDate(ed)} ${fmtTime(endIso)}`;
}

/** Minuter som läsbar tid: 45 min, 1 h, 1 h 30 min. */
export function fmtMinutes(min: number): string {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60), r = m % 60;
  const s = h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
  return min < 0 ? `−${s}` : s;
}

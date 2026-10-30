// Löneunderlag: OB-regler och uträkning av OB-timmar per pass.
import { TZ, addDays, weekday } from "@/lib/datum";

const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** ms → "2026-10-09 18:30" i svensk tid (formatteraren återanvänds, det här körs per minut). */
const localStamp = (ms: number) => fmt.format(ms);

export type ObRule = { code: string; title: string };
export type ObSettings = {
  hourlyTitle: string;          // raden för alla arbetade timmar ("Timlön")
  evening: ObRule & { from: string; to: string };
  night: ObRule & { from: string; to: string };
  weekend: ObRule;              // lör–sön hela dygnet samt helgdagar enligt avtalet
};

export const DEFAULT_OB: ObSettings = {
  hourlyTitle: "Timlön",
  // Kollektivavtal Trossamfund (Arbetsgivaralliansen) § 7: mån–fre 18–24 och 00–07,
  // lör 07–sön 24 (FCC räknar även lör 00–07 som helg, "OB helg inkl natt lör-sön").
  evening: { code: "413", title: "OB Vardag Kväll", from: "18:00", to: "00:00" },
  night: { code: "414", title: "OB Vardag Natt", from: "00:00", to: "07:00" },
  weekend: { code: "416", title: "OB Helg" },
};

/** Läser OB-inställningarna (app_settings.payroll_ob), med standardvärden som reserv. */
export function parseObSettings(raw: string | null | undefined): ObSettings {
  try {
    const v = JSON.parse(raw || "{}") as Partial<ObSettings>;
    return {
      hourlyTitle: v.hourlyTitle || DEFAULT_OB.hourlyTitle,
      evening: { ...DEFAULT_OB.evening, ...v.evening },
      night: { ...DEFAULT_OB.night, ...v.night },
      weekend: { ...DEFAULT_OB.weekend, ...v.weekend },
    };
  } catch {
    return DEFAULT_OB;
  }
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Är minuten (från midnatt) inom fönstret? Fönster som går över midnatt (22–06) hanteras. */
function inWindow(min: number, from: string, to: string) {
  const a = toMin(from);
  const b = toMin(to);
  if (a === b) return false;
  return a < b ? min >= a && min < b : min >= a || min < b;
}

/** Påskdagen ett visst år (Gauss/Meeus). */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Första datumet från `from` som är en viss veckodag (0 = måndag). */
const firstWeekday = (from: string, wd: number) => addDays(from, (wd - weekday(from) + 7) % 7);

const holidayCache = new Map<number, Map<string, number>>();
/**
 * Helgdagar och aftnar enligt avtalet → minut på dygnet då helg-OB börjar.
 * Trettondagen, 1 maj, Kristi himmelsfärd, 6 juni, alla helgons dag och pingst-, midsommar-,
 * jul- och nyårsafton från kl. 07; skärtorsdagen från kl. 18. Därefter helg till första vardagen.
 */
export function holidays(y: number): Map<string, number> {
  const hit = holidayCache.get(y);
  if (hit) return hit;
  const e = easter(y);
  const from7 = [
    `${y}-01-01`, `${y}-01-06`,
    addDays(e, -2), addDays(e, -1), e, addDays(e, 1), // långfredag, påskafton, påskdagen, annandag påsk
    `${y}-05-01`, addDays(e, 39), `${y}-06-06`,       // 1 maj, Kristi himmelsfärd, nationaldagen
    addDays(e, 48), addDays(e, 49),                   // pingstafton, pingstdagen
    firstWeekday(`${y}-06-19`, 4), firstWeekday(`${y}-06-20`, 5), // midsommarafton, midsommardagen
    firstWeekday(`${y}-10-31`, 5),                    // alla helgons dag
    `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`,
  ];
  const map = new Map(from7.map((d) => [d, 7 * 60]));
  map.set(addDays(e, -3), 18 * 60); // skärtorsdagen
  holidayCache.set(y, map);
  return map;
}

const holidayStart = (date: string) => holidays(Number(date.slice(0, 4))).get(date);

/** Helg-OB: lör–sön hela dygnet; helgdag från kl. 07 (hela dygnet om dagen före också var helgdag). */
function isWeekendOb(date: string, min: number) {
  if (weekday(date) >= 5) return true;
  const start = holidayStart(date);
  if (start == null) return false;
  return holidayStart(addDays(date, -1)) != null || min >= start;
}

/**
 * OB-timmar för ett pass. Varje minut av arbetspasset klassas i svensk tid:
 * helg går före natt som går före kväll. Rasten dras av
 * proportionerligt, så summan av OB aldrig blir mer än de arbetade timmarna.
 */
export function obHours(startIso: string, endIso: string, breakMinutes: number, s: ObSettings) {
  const out = { evening: 0, night: 0, weekend: 0 };
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const total = Math.round((end - start) / 60_000);
  if (total <= 0) return out;
  for (let i = 0; i < total; i++) {
    const local = localStamp(start + i * 60_000); // "2026-10-09 18:30"
    const date = local.slice(0, 10);
    const min = toMin(local.slice(-5));
    if (isWeekendOb(date, min)) out.weekend++;
    else if (inWindow(min, s.night.from, s.night.to)) out.night++;
    else if (inWindow(min, s.evening.from, s.evening.to)) out.evening++;
  }
  const factor = Math.max(0, total - (breakMinutes ?? 0)) / total / 60;
  return { evening: out.evening * factor, night: out.night * factor, weekend: out.weekend * factor };
}

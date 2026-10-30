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
  weekend: ObRule;              // lör, sön och helgdagar (hela dygnet)
};

export const DEFAULT_OB: ObSettings = {
  hourlyTitle: "Timlön",
  evening: { code: "413", title: "OB Vardag Kväll", from: "18:00", to: "22:00" },
  night: { code: "414", title: "OB Vardag Natt", from: "22:00", to: "06:00" },
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

const holidayCache = new Map<number, Set<string>>();
/** Svenska helgdagar och helgaftnar som räknas som helg för OB. */
export function holidays(y: number): Set<string> {
  const hit = holidayCache.get(y);
  if (hit) return hit;
  const e = easter(y);
  const set = new Set([
    `${y}-01-01`, `${y}-01-06`,
    addDays(e, -2), addDays(e, -1), e, addDays(e, 1), // långfredag, påskafton, påskdagen, annandag påsk
    `${y}-05-01`, addDays(e, 39), `${y}-06-06`,       // 1 maj, Kristi himmelsfärd, nationaldagen
    addDays(e, 48), addDays(e, 49),                   // pingstafton, pingstdagen
    firstWeekday(`${y}-06-19`, 4), firstWeekday(`${y}-06-20`, 5), // midsommarafton, midsommardagen
    firstWeekday(`${y}-10-31`, 5),                    // alla helgons dag
    `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`,
  ]);
  holidayCache.set(y, set);
  return set;
}

const isHoliday = (date: string) => weekday(date) >= 5 || holidays(Number(date.slice(0, 4))).has(date);

/**
 * OB-timmar för ett pass. Varje minut av arbetspasset klassas i svensk tid:
 * helg (lör, sön, helgdagar) går före natt som går före kväll. Rasten dras av
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
    if (isHoliday(date)) out.weekend++;
    else if (inWindow(min, s.night.from, s.night.to)) out.night++;
    else if (inWindow(min, s.evening.from, s.evening.to)) out.evening++;
  }
  const factor = Math.max(0, total - (breakMinutes ?? 0)) / total / 60;
  return { evening: out.evening * factor, night: out.night * factor, weekend: out.weekend * factor };
}

// Logeskärmen: data från loge_feed(), texter på svenska och engelska och uträkningarna som skärmen visar.

export type Lang = "sv" | "en";
export type LangMode = Lang | "vaxla";

export type LogeBooking = { room: string; room_en: string | null; start: string; end: string };
export type LogeRunItem = { starts_at: string; duration_minutes: number | null; title: string; who: string | null; room: string | null; room_en: string | null };
export type LogeEvent = { id: string; title: string; start: string; end: string; bookings: LogeBooking[]; run_sheet: LogeRunItem[] };
export type LogeSettings = Partial<Record<"loge_camera_url" | "loge_wifi_name" | "loge_wifi_password" | "loge_info_sv" | "loge_info_en", string>>;
export type LogeFeed = { now: string; settings: LogeSettings; events: LogeEvent[] };

export const TEXT = {
  sv: {
    welcome: "Välkommen",
    welcomeHouse: "Välkommen till Filadelfia Convention Center",
    schedule: "Dagens schema",
    rooms: "Era lokaler idag",
    now: "Nu",
    next: "Nästa",
    inMin: (n: number) => `om ${n} min`,
    at: (t: string) => `kl. ${t}`,
    done: "Dagens schema är avklarat. Tack för idag!",
    noEvent: "Inga evenemang i huset idag.",
    camera: "Scenen live",
    cameraOff: "Kameran visas inte just nu.",
    wifi: "Wi-Fi",
    network: "Nätverk",
    password: "Lösenord",
    alsoToday: "Också i huset idag",
    switchTo: "English",
  },
  en: {
    welcome: "Welcome",
    welcomeHouse: "Welcome to Filadelfia Convention Center",
    schedule: "Today's schedule",
    rooms: "Your rooms today",
    now: "Now",
    next: "Next",
    inMin: (n: number) => `in ${n} min`,
    at: (t: string) => `at ${t}`,
    done: "Today's schedule is complete. Thank you!",
    noEvent: "No events in the house today.",
    camera: "Stage live",
    cameraOff: "The camera is not available right now.",
    wifi: "Wi-Fi",
    network: "Network",
    password: "Password",
    alsoToday: "Also in the house today",
    switchTo: "Svenska",
  },
} as const;

export const parseLang = (v: string | string[] | undefined): LangMode =>
  v === "en" ? "en" : v === "vaxla" || v === "auto" ? "vaxla" : "sv";

const t = (iso: string) => new Date(iso).getTime();

/**
 * Evenemanget som skärmen handlar om: det som har ett körschema idag går före,
 * sedan det som spelar i Stora salen, sedan det som börjar först.
 */
export function pickEvent(events: LogeEvent[]): LogeEvent | null {
  const score = (e: LogeEvent) => (e.run_sheet.length ? 2 : 0) + (e.bookings.some((b) => b.room.startsWith("Stora salen")) ? 1 : 0);
  return [...events].sort((a, b) => score(b) - score(a) || t(a.start) - t(b.start))[0] ?? null;
}

export const itemEnd = (x: LogeRunItem) => (x.duration_minutes ? t(x.starts_at) + x.duration_minutes * 60000 : null);

/** Vilken punkt som pågår och vilken som kommer härnäst. En punkt utan längd pågår tills nästa börjar. */
export function nowNext(items: LogeRunItem[], now: Date): { current: number; next: number } {
  const n = now.getTime();
  let current = -1;
  items.forEach((x, i) => {
    const end = itemEnd(x) ?? (items[i + 1] ? t(items[i + 1].starts_at) : null);
    if (t(x.starts_at) <= n && (end === null || n < end)) current = i;
  });
  const next = items.findIndex((x) => t(x.starts_at) > n);
  return { current, next };
}

/** Minuter kvar till en tidpunkt, avrundat uppåt. */
export const minutesUntil = (iso: string, now: Date) => Math.max(0, Math.ceil((t(iso) - now.getTime()) / 60000));

export type InfoBlock = { heading: string | null; lines: string[] };

/** Infotexten: en rad per punkt, rader som börjar med "# " blir rubriker. */
export function parseInfo(text: string | undefined): InfoBlock[] {
  const blocks: InfoBlock[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) blocks.push({ heading: line.slice(2).trim(), lines: [] });
    else {
      if (!blocks.length) blocks.push({ heading: null, lines: [] });
      blocks.at(-1)!.lines.push(line);
    }
  }
  return blocks.filter((b) => b.heading || b.lines.length);
}

export type Camera =
  | { kind: "none" }
  | { kind: "hls"; src: string }
  | { kind: "mjpeg"; src: string }
  | { kind: "snapshot"; src: string }
  | { kind: "video"; src: string }
  | { kind: "iframe"; src: string }
  | { kind: "unifi"; src: string };

/** Vad för slags kameralänk det är, och hur den ska visas. */
export function cameraOf(url: string | undefined): Camera {
  const raw = (url ?? "").trim();
  if (!raw) return { kind: "none" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: "none" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "none" };
  const path = u.pathname.toLowerCase();
  const host = u.hostname.replace(/^www\./, "");

  const yt =
    host === "youtu.be" ? path.slice(1) :
    host.endsWith("youtube.com") ? (u.searchParams.get("v") ?? path.match(/^\/(?:live|embed|shorts)\/([^/]+)/)?.[1] ?? null) :
    null;
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&controls=0&playsinline=1` };

  // UniFi Protects delningssida: videon visas beskuren utan sidans ram, se UNIFI_FRAME.
  if (host === "monitor.ui.com") return { kind: "unifi", src: raw };
  if (path.endsWith(".m3u8")) return { kind: "hls", src: raw };
  if (/\.(mp4|webm)$/.test(path)) return { kind: "video", src: raw };
  if (/mjpe?g|video\.cgi|mjpg\.cgi/.test(path) || u.searchParams.get("action") === "stream") return { kind: "mjpeg", src: raw };
  if (/\.(jpe?g|png)$/.test(path) || /snapshot|snap\.|image\.cgi|jpg\/image/.test(path)) return { kind: "snapshot", src: raw };
  return { kind: "iframe", src: raw };
}

/**
 * UniFi-delningssidan ritad i en fast storlek, och var videon hamnar på den (uppmätt i webbläsaren).
 * Skärmen skalar upp rutan så att bara videon syns. Ändrar Ubiquiti sidans layout måste måtten mätas om.
 */
export const UNIFI_FRAME = { width: 800, height: 600, video: { x: 108, y: 124, width: 584, height: 328 } };

/** Skala och förskjutning så att videodelen fyller en ruta på w × h pixlar (fyller hela, beskär hellre än lämnar kant). */
export function unifiCrop(w: number, h: number) {
  const v = UNIFI_FRAME.video;
  const scale = Math.max(w / v.width, h / v.height);
  const x = (w - v.width * scale) / 2 - v.x * scale;
  const y = (h - v.height * scale) / 2 - v.y * scale;
  return { scale, x, y };
}

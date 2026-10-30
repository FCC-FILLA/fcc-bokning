export const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export type Stats = {
  year: number;
  occupancy: { room_id: string; room: string; parent_id: string | null; months: { m: number; days: number; days_all: number; hours: number; days_in_month: number }[] }[];
  quotes: { m: number; sent: number; sent_value: number; won: number; won_value: number; lost: number; lost_value: number }[];
  by_category: { category: string; count: number; value: number }[];
  by_type: { type: string; color: string | null; events: number; value: number; avg: number }[];
  events: Record<string, number>;
  participants: number;
};

/** Sammanfattning: beläggning, vinstandel och summor. */
export function summarize(s: Stats) {
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + Number(f(x) || 0), 0);
  const sentValue = sum(s.quotes, (q) => q.sent_value);
  const wonValue = sum(s.quotes, (q) => q.won_value);
  const won = sum(s.quotes, (q) => q.won);
  const lost = sum(s.quotes, (q) => q.lost);
  return {
    sentValue, wonValue, won, lost,
    sent: sum(s.quotes, (q) => q.sent),
    winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
    events: (s.events.bekraftad ?? 0) + (s.events.genomford ?? 0),
    cancelled: s.events.avbokad ?? 0,
  };
}

/** Andel av månadens dagar med bekräftad bokning. */
export const pct = (m: { days: number; days_in_month: number }) => Math.round((m.days / m.days_in_month) * 100);

export type MoreStats = {
  top_customers: { id: string; name: string; value: number; hours: number; events: number }[];
  room_revenue: { room: string; value: number }[];
  week: { dow: number; hour: number; hours: number }[];
  lead: { bucket: string; events: number }[];
  inquiries: { m: number; count: number; won: number }[];
  staff: { m: number; hours: number; shifts: number }[];
  booked_hours: number;
};

/** Förändring mot föregående år i procent, eller null om det saknas jämförelse. */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

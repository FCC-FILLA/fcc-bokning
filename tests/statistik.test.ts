import { describe, expect, it } from "vitest";
import { pct, summarize, type Stats } from "@/lib/statistik";
import { buildStatsWorkbook } from "@/lib/statistik-excel";

const s: Stats = {
  year: 2030,
  occupancy: [{ room_id: "a", room: "Birka", parent_id: null, months: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, days: i === 0 ? 31 : 0, days_all: 0, hours: 10, days_in_month: 31 })) }],
  quotes: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, sent: 2, sent_value: 1000, won: i < 3 ? 1 : 0, won_value: 500, lost: 1, lost_value: 100 })),
  by_category: [{ category: "Eventbyrå", count: 3, value: 1500 }],
  by_type: [{ type: "Konferens", color: null, events: 3, value: 1500, avg: 500 }],
  events: { bekraftad: 4, genomford: 6, avbokad: 1 },
  participants: 900,
};

describe("statistik", () => {
  it("summerar och räknar vinstandel av besvarade", () => {
    const t = summarize(s);
    expect(t).toMatchObject({ sent: 24, sentValue: 12000, won: 3, lost: 12, winRate: 20, events: 10, cancelled: 1 });
    expect(pct({ days: 31, days_in_month: 31 })).toBe(100);
  });
  it("bygger en Excel-fil", async () => {
    const buf = await buildStatsWorkbook(s);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});

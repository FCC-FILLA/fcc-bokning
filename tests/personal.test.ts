import { describe, expect, it } from "vitest";
import { rateFor, shiftHours, staffingSummary, type StaffFunction } from "../src/lib/personal";

const fn = (id: string, sort: number, rate = 200): StaffFunction => ({ id, name: id, color: "#000", hourly_rate: rate, active: true, sort_order: sort });

describe("personal", () => {
  it("räknar timmar över midnatt", () => {
    expect(shiftHours({ starts_at: "2027-01-01T21:00:00Z", ends_at: "2027-01-02T01:30:00Z" })).toBe(4.5);
  });

  it("tar passets pris före personens före funktionens", () => {
    expect(rateFor({ hourly_rate: 300 }, { hourly_rate: 250 }, fn("a", 1))).toBe(300);
    expect(rateFor({ hourly_rate: null }, { hourly_rate: 250 }, fn("a", 1))).toBe(250);
    expect(rateFor({ hourly_rate: null }, null, fn("a", 1, 180))).toBe(180);
  });

  it("summerar bemanning per funktion och räknar inte över antalet", () => {
    const shifts = [
      { id: "1", function_id: "garderob", needed: 6 },
      { id: "2", function_id: "garderob", needed: 4 },
      { id: "3", function_id: "kiosk", needed: 1 },
    ];
    const a = [
      ...Array.from({ length: 5 }, () => ({ shift_id: "1", status: "tilldelad" as const })),
      ...Array.from({ length: 3 }, () => ({ shift_id: "2", status: "tilldelad" as const })),
      { shift_id: "2", status: "ansokt" as const },
      { shift_id: "3", status: "tilldelad" as const },
      { shift_id: "3", status: "tilldelad" as const },
    ];
    const s = staffingSummary(shifts, a, [fn("kiosk", 2), fn("garderob", 1)]);
    expect(s.map((x) => `${x.fn.id} ${x.filled}/${x.needed}`)).toEqual(["garderob 8/10", "kiosk 1/1"]);
  });
});

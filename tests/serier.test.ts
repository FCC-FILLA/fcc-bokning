import { describe, expect, it } from "vitest";
import { isoToLocal, localToIso } from "../src/lib/datum";
import { chunkDays, describeDates, groupSeries, matrixGroups, retime, shiftMinutes } from "../src/lib/serier";

const b = (id: string, room: string, from: string, to: string, extra: Partial<{ phase: string; note: string; setup_id: string }> = {}) => ({
  id,
  room_id: room,
  starts_at: localToIso(from),
  ends_at: localToIso(to),
  setup_id: extra.setup_id ?? null,
  note: extra.note ?? null,
  phase: extra.phase ?? null,
});

describe("serier", () => {
  it("slår ihop samma lokal, tid och fas över flera dagar och håller isär olika faser", () => {
    const s = groupSeries([
      b("1", "A", "2027-03-11T08:00", "2027-03-11T17:00"),
      b("2", "A", "2027-03-12T08:00", "2027-03-12T17:00"),
      b("3", "A", "2027-03-13T08:00", "2027-03-13T17:00"),
      b("4", "A", "2027-03-10T08:00", "2027-03-10T23:00", { phase: "bygg" }),
      b("5", "B", "2027-03-11T08:00", "2027-03-11T17:00"),
      b("6", "A", "2027-03-14T20:00", "2027-03-15T02:00", { phase: "riv" }),
    ]);
    expect(s).toHaveLength(4);
    const main = s.find((x) => x.room_id === "A" && x.phase === "genomforande")!;
    expect(main.ids).toEqual(["1", "2", "3"]);
    expect(main.from).toBe("08:00");
    expect(s.find((x) => x.phase === "riv")!.spanDays).toBe(1);
  });

  it("skriver sammanhängande dagar som intervall", () => {
    expect(describeDates(["2027-03-11", "2027-03-12", "2027-03-13", "2027-03-18"])).toBe("tor 11–lör 13 mar, tor 18 mar");
    expect(describeDates(["2027-03-31", "2027-04-01"])).toBe("ons 31 mar–tor 1 apr");
  });

  it("byter klockslag men behåller datum, även över midnatt", () => {
    const r = retime(localToIso("2027-03-11T08:00"), "18:00", "01:00");
    expect(isoToLocal(r.starts_at)).toBe("2027-03-11T18:00");
    expect(isoToLocal(r.ends_at)).toBe("2027-03-12T01:00");
    expect(isoToLocal(shiftMinutes(localToIso("2027-03-11T08:00"), -30))).toBe("2027-03-11T07:30");
  });

  it("grupperar lokaler under sin översta lokal och delar upp dagar i veckoblock", () => {
    const rooms = [
      { id: "s", parent_id: null, name: "Stora salen", sort_order: 1 },
      { id: "r", parent_id: null, name: "Rörstrand", sort_order: 2 },
      { id: "r1", parent_id: "r", name: "Rörstrand 1", sort_order: 3 },
      { id: "b", parent_id: null, name: "Birka", sort_order: 4 },
    ];
    const g = matrixGroups(rooms, new Set(["r1", "b", "s"]));
    expect(g.map((x) => x.label)).toEqual([null, "Rörstrand", null]);
    expect(g.map((x) => x.rooms.map((r) => r.id))).toEqual([["s"], ["r1"], ["b"]]);
    expect(chunkDays(Array.from({ length: 9 }, (_, i) => `2027-03-${String(10 + i).padStart(2, "0")}`)).map((c) => c.length)).toEqual([7, 2]);
  });
});

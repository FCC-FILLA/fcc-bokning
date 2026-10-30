import { describe, expect, it } from "vitest";
import { eventsOn, nextDays, roomStates, staffing, type ScreenEvent, type ScreenRoom } from "@/lib/skarm";

const ev = (over: Partial<ScreenEvent>): ScreenEvent => ({
  id: "e", title: "Test", status: "bekraftad", type: null, color: null, company: null, participants: null,
  responsible: null, staff_info: null, start: "", end: "", bookings: [], shifts: [], ...over,
});

const rooms: ScreenRoom[] = [
  { name: "Stora salen", parent: null },
  { name: "Rörstrandssalarna", parent: null },
  { name: "Rörstrand 1", parent: "Rörstrandssalarna" },
  { name: "Rörstrand 2", parent: "Rörstrandssalarna" },
  { name: "Birka", parent: null },
];

describe("kontorsskärm", () => {
  it("tar med bokningar som startar dagen och som pågår över midnatt, men inte de som slutar precis vid midnatt", () => {
    const e = ev({ bookings: [
      { room: "Birka", start: "2027-03-01T20:00:00+01:00", end: "2027-03-02T02:00:00+01:00", setup: null },
      { room: "Stora salen", start: "2027-03-01T18:00:00+01:00", end: "2027-03-02T00:00:00+01:00", setup: null },
    ] });
    expect(eventsOn([e], "2027-03-01")[0].bookings).toHaveLength(2);
    const next = eventsOn([e], "2027-03-02");
    expect(next[0].bookings.map((b) => b.room)).toEqual(["Birka"]);
    expect(eventsOn([e], "2027-03-03")).toEqual([]);
  });

  it("räknar en hel sal på delarna och visar inte den delade salen själv", () => {
    const e = ev({ title: "Mässa", bookings: [{ room: "Rörstrandssalarna", start: "2027-03-01T08:00:00+01:00", end: "2027-03-01T17:00:00+01:00", setup: null }] });
    const spans = eventsOn([e], "2027-03-01");
    const s = roomStates(rooms, spans, new Date("2027-03-01T12:00:00+01:00"));
    expect(s.map((r) => `${r.room}:${r.kind}`)).toEqual(["Stora salen:free", "Rörstrand 1:live", "Rörstrand 2:live", "Birka:free"]);
    const later = roomStates(rooms, spans, new Date("2027-03-01T18:00:00+01:00"));
    expect(later.find((r) => r.room === "Rörstrand 1")?.kind).toBe("done");
  });

  it("summerar bemanning utan att räkna överbemanning", () => {
    const e = ev({ bookings: [{ room: "Birka", start: "2027-03-01T08:00:00+01:00", end: "2027-03-01T17:00:00+01:00", setup: null }], shifts: [
      { function: "Värd", color: "#000000", start: "2027-03-01T08:00:00+01:00", end: "2027-03-01T12:00:00+01:00", needed: 2, assigned: 3 },
      { function: "Garderob", color: "#000000", start: "2027-03-01T12:00:00+01:00", end: "2027-03-01T17:00:00+01:00", needed: 4, assigned: 1 },
    ] });
    expect(staffing(eventsOn([e], "2027-03-01"), "2027-03-01")).toEqual({ needed: 6, assigned: 3 });
  });

  it("veckan framåt är de sju dagarna efter idag", () => {
    expect(nextDays("2026-10-30")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
});

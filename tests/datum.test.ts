import { describe, expect, it } from "vitest";
import { addDays, fmtRange, isoToLocal, isoWeek, localToIso, mondayOf } from "../src/lib/datum";

describe("datum", () => {
  it("räknar om svensk tid till UTC, även över sommartid", () => {
    expect(localToIso("2027-01-15T12:00")).toBe("2027-01-15T11:00:00.000Z");
    expect(localToIso("2027-07-15T12:00")).toBe("2027-07-15T10:00:00.000Z");
    expect(isoToLocal("2027-07-15T10:00:00.000Z")).toBe("2027-07-15T12:00");
  });

  it("hittar måndagen och veckonumret", () => {
    expect(mondayOf("2026-10-28")).toBe("2026-10-26");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(isoWeek("2026-10-28")).toBe(44);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formaterar tidsintervall", () => {
    expect(fmtRange(localToIso("2027-03-01T12:00"), localToIso("2027-03-01T23:00"))).toBe("mån 1 mar 2027, 12:00–23:00");
    expect(fmtRange(localToIso("2027-03-01T12:00"), localToIso("2027-03-02T00:00"))).toBe("mån 1 mar 2027, 12:00–24:00");
    expect(fmtRange(localToIso("2027-03-01T12:00"), localToIso("2027-03-02T02:00"))).toBe("mån 1 mar 2027 12:00 – tis 2 mar 2027 02:00");
  });
});

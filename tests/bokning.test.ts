import { describe, expect, it } from "vitest";
import { daysBetween, expandRows, parseRows, shiftIso } from "../src/lib/bokning";
import { isoToLocal } from "../src/lib/datum";

const ROOM_A = "11111111-1111-1111-1111-111111111111";
const ROOM_B = "22222222-2222-2222-2222-222222222222";

describe("bokningsrader", () => {
  it("gör olika lokaler med olika tider till bokningar, och upprepar veckovis", () => {
    const { rows, error } = parseRows(
      JSON.stringify([
        { room_id: ROOM_A, date: "2027-03-05", from: "07:00", to: "23:00", setup_id: "bio", note: "" },
        { room_id: ROOM_B, date: "2027-03-06", from: "18:00", to: "02:00" },
      ]),
    );
    expect(error).toBeNull();
    const out = expandRows(rows, 2, "e1");
    expect(out).toHaveLength(4);
    expect(isoToLocal(out[1].starts_at)).toBe("2027-03-06T18:00");
    expect(isoToLocal(out[1].ends_at)).toBe("2027-03-07T02:00");
    expect(isoToLocal(out[3].starts_at)).toBe("2027-03-13T18:00");
    expect(out[0].setup_id).toBe("bio");
    expect(out[0].note).toBeNull();
  });

  it("stoppar rader som saknar lokal eller tid", () => {
    expect(parseRows(JSON.stringify([{ room_id: "", date: "2027-03-05", from: "07:00", to: "08:00" }])).error).toMatch(/lokal/);
    expect(parseRows("inte json").error).toBeTruthy();
  });

  it("flyttar bokningar över sommartid utan att klockslaget ändras", () => {
    const start = "2027-03-20T17:00:00.000Z"; // 18:00 vintertid
    const moved = shiftIso(start, 14); // 3 april, sommartid
    expect(isoToLocal(moved)).toBe("2027-04-03T18:00");
    expect(daysBetween("2027-03-20", "2027-04-03")).toBe(14);
  });
});

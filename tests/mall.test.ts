import { describe, expect, it } from "vitest";
import { isoToLocal, localToIso } from "../src/lib/datum";
import { bookingsFromTemplate, templateFromBookings } from "../src/lib/mall";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("mallar", () => {
  it("gör om ett evenemang till mall och tillbaka till ett nytt datum", () => {
    const tpl = templateFromBookings([
      { room_id: B, starts_at: localToIso("2027-03-06T18:00"), ends_at: localToIso("2027-03-07T02:00"), setup_id: null, note: "riv" },
      { room_id: A, starts_at: localToIso("2027-03-05T07:00"), ends_at: localToIso("2027-03-05T23:00"), setup_id: "bio", note: null },
    ]);
    expect(tpl.map((t) => t.day_offset).sort()).toEqual([0, 1]);

    const out = bookingsFromTemplate(tpl, "2027-10-01", "e2");
    const b = out.find((x) => x.room_id === B)!;
    expect(isoToLocal(b.starts_at)).toBe("2027-10-02T18:00");
    expect(isoToLocal(b.ends_at)).toBe("2027-10-03T02:00");
    const a = out.find((x) => x.room_id === A)!;
    expect(isoToLocal(a.starts_at)).toBe("2027-10-01T07:00");
    expect(a.setup_id).toBe("bio");
  });

  it("klarar tider från databasen med sekunder", () => {
    const out = bookingsFromTemplate(
      [{ day_offset: 2, room_id: A, start_time: "09:00:00", end_time: "17:30:00", setup_id: null, note: null }],
      "2027-01-30",
      "e",
    );
    expect(isoToLocal(out[0].starts_at)).toBe("2027-02-01T09:00");
    expect(isoToLocal(out[0].ends_at)).toBe("2027-02-01T17:30");
  });
});

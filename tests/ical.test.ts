import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, fold } from "../src/lib/ical";

describe("kalenderfil", () => {
  it("escapar specialtecken", () => {
    expect(escapeText("Konsert; Läktare, Balkong\nrad 2")).toBe("Konsert\\; Läktare\\, Balkong\\nrad 2");
  });

  it("viker långa rader utan att dela åäö mitt i", () => {
    const line = "SUMMARY:" + "Årskonferens för Kör- och Orkesterförbundet ".repeat(4);
    const folded = fold(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("skapar en giltig kalender i UTC", () => {
    const ics = buildCalendar("FCC", [
      { uid: "b1@fcc", start: "2027-03-05T06:00:00.000Z", end: "2027-03-05T22:00:00.000Z", summary: "Konsert", location: "Stora salen", status: "CONFIRMED" },
    ], "2027-01-01T00:00:00.000Z");
    expect(ics).toContain("DTSTART:20270305T060000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

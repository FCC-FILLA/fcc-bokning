import { describe, expect, it } from "vitest";
import { cameraOf, unifiCrop, UNIFI_FRAME, nowNext, parseInfo, parseLang, pickEvent, type LogeEvent, type LogeRunItem } from "@/lib/loge";

const item = (starts_at: string, title: string, duration_minutes: number | null = null): LogeRunItem => ({
  starts_at, title, duration_minutes, who: null, room: null, room_en: null,
});
const ev = (id: string, start: string, rooms: string[], run: LogeRunItem[] = []): LogeEvent => ({
  id, title: id, start, end: start, run_sheet: run,
  bookings: rooms.map((room) => ({ room, room_en: null, start, end: start })),
});

describe("logeskärm", () => {
  it("känner igen kameralänkar", () => {
    expect(cameraOf("").kind).toBe("none");
    expect(cameraOf("inte en länk").kind).toBe("none");
    expect(cameraOf("rtsp://10.0.0.5/stream").kind).toBe("none");
    expect(cameraOf("https://cam.example.se/live/index.m3u8")).toEqual({ kind: "hls", src: "https://cam.example.se/live/index.m3u8" });
    expect(cameraOf("http://10.0.0.5/mjpg/video.mjpg").kind).toBe("mjpeg");
    expect(cameraOf("https://cam.example.se/axis-cgi/jpg/image.cgi").kind).toBe("snapshot");
    expect(cameraOf("https://www.youtube.com/watch?v=abc123")).toEqual({
      kind: "iframe", src: "https://www.youtube.com/embed/abc123?autoplay=1&mute=1&controls=0&playsinline=1",
    });
    expect(cameraOf("https://youtu.be/abc123").kind).toBe("iframe");
    expect(cameraOf("https://www.youtube.com/live/xyz?si=1")).toMatchObject({ src: expect.stringContaining("/embed/xyz?") });
    expect(cameraOf("https://player.example.se/scen")).toEqual({ kind: "iframe", src: "https://player.example.se/scen" });
  });

  it("beskär UniFi-delningssidan så att videon fyller rutan", () => {
    expect(cameraOf("https://monitor.ui.com/abc").kind).toBe("unifi");
    const v = UNIFI_FRAME.video;
    const c = unifiCrop(1168, 657);
    expect(c.scale).toBeCloseTo(2, 1);
    // Videons vänstra och övre kant hamnar i rutans hörn (inom en pixel).
    expect(Math.abs(c.x + v.x * c.scale)).toBeLessThan(2);
    expect(Math.abs(c.y + v.y * c.scale)).toBeLessThan(2);
  });

  it("delar upp infotexten i rubriker och punkter", () => {
    expect(parseInfo("Utan rubrik\n# Praktiskt\nRad 1\n\n  Rad 2  \n# Tom\n")).toEqual([
      { heading: null, lines: ["Utan rubrik"] },
      { heading: "Praktiskt", lines: ["Rad 1", "Rad 2"] },
      { heading: "Tom", lines: [] },
    ]);
    expect(parseInfo(undefined)).toEqual([]);
  });

  it("vet vad som pågår och vad som är nästa", () => {
    const items = [item("2027-03-01T15:00:00Z", "Soundcheck", 60), item("2027-03-01T17:30:00Z", "Insläpp"), item("2027-03-01T18:30:00Z", "Show")];
    expect(nowNext(items, new Date("2027-03-01T14:00:00Z"))).toEqual({ current: -1, next: 0 });
    expect(nowNext(items, new Date("2027-03-01T15:30:00Z"))).toEqual({ current: 0, next: 1 });
    expect(nowNext(items, new Date("2027-03-01T16:30:00Z"))).toEqual({ current: -1, next: 1 });
    expect(nowNext(items, new Date("2027-03-01T18:00:00Z"))).toEqual({ current: 1, next: 2 });
    expect(nowNext(items, new Date("2027-03-01T23:00:00Z"))).toEqual({ current: 2, next: -1 });
  });

  it("väljer evenemanget med körschema, sedan Stora salen, sedan det tidigaste", () => {
    const a = ev("a", "2027-03-01T08:00:00Z", ["Birka"]);
    const b = ev("b", "2027-03-01T12:00:00Z", ["Stora salen"]);
    const c = ev("c", "2027-03-01T13:00:00Z", ["Karlbergssalen"], [item("2027-03-01T13:00:00Z", "Start")]);
    expect(pickEvent([a, b])?.id).toBe("b");
    expect(pickEvent([a, b, c])?.id).toBe("c");
    expect(pickEvent([])).toBeNull();
  });

  it("läser språket från länken", () => {
    expect(parseLang("en")).toBe("en");
    expect(parseLang("vaxla")).toBe("vaxla");
    expect(parseLang(undefined)).toBe("sv");
    expect(parseLang("de")).toBe("sv");
  });
});

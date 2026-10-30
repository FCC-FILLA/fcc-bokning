import { describe, expect, it } from "vitest";
import { countItems, generate, halfExtents, parseItems, planFor, snapToObjects, type FurnitureType, type LayoutItem } from "../src/lib/moblering";

const T = (id: string, shape: FurnitureType["shape"], w: number, d: number, chairs = 0): FurnitureType => ({
  id, name: id, shape, width_m: w, depth_m: d, default_chairs: chairs, max_chairs: chairs + 2, stock: null, color: null, sort_order: 0, active: true,
});
const types = [T("stol", "chair", 0.5, 0.5), T("rund180", "round", 1.8, 1.8, 10), T("skolbord", "rect", 1.8, 0.5, 3), T("bord180", "rect", 1.8, 0.8, 6), T("stabord", "round", 0.7, 0.7)];
const plan = { width: 20, depth: 15, items: [] };
const inside = (x: { x: number; y: number }) => x.x > 0 && x.x < plan.width && x.y > 0 && x.y < plan.depth;

describe("möbleringsgenerator", () => {
  it("bankett ger rätt antal platser och håller sig i lokalen", () => {
    const r = generate(plan, types, { kind: "bankett", guests: 100, front: 3, margin: 1, aisle: 0 });
    expect(r.full).toBe(false);
    expect(countItems(r.items).chairs).toBe(100);
    expect(r.items.every(inside)).toBe(true);
    expect(r.items.every((i) => i.y >= 3)).toBe(true);
  });
  it("teater fyller med stolsrader och mittgång", () => {
    const r = generate(plan, types, { kind: "teater", guests: 150, front: 3, margin: 1, aisle: 1.2 });
    expect(countItems(r.items).chairs).toBe(150);
    expect(r.items.some((i) => Math.abs(i.x - 10) < 0.6)).toBe(false);
  });
  it("säger till när ytan inte räcker", () => {
    const r = generate(plan, types, { kind: "klassrum", guests: 1000, front: 3, margin: 1, aisle: 1.2 });
    expect(r.full).toBe(true);
    expect(r.seats).toBeLessThan(1000);
    expect(countItems(r.items).chairs).toBe(r.seats);
  });
  it("långbord och mingel fungerar", () => {
    expect(countItems(generate(plan, types, { kind: "langbord", guests: 60, front: 2, margin: 1, aisle: 0 }).items).chairs).toBe(60);
    expect(generate(plan, types, { kind: "mingel", guests: 80, front: 2, margin: 1, aisle: 0 }).items.length).toBe(10);
  });
  it("tål trasig data och gissar mått från kvm", () => {
    expect(parseItems([{ t: "stol", x: "1", y: 2 }, { x: 1 }, null])).toHaveLength(1);
    const p = planFor(null, 300);
    expect(p.width * p.depth).toBeGreaterThan(250);
  });
});

describe("fasta delar", () => {
  it("möblerar inte över pelare", () => {
    const withPillar = { ...plan, items: [{ id: "p", t: "pelare", x: 10.6, y: 6, r: 0, w: 0.5, d: 0.5, shape: "fixed" as const }] };
    const r = generate(withPillar, types, { kind: "teater", guests: 150, front: 3, margin: 1, aisle: 1.2 });
    expect(countItems(r.items).chairs).toBe(150);
    expect(r.items.some((i) => Math.abs(i.x - 10.6) < 0.8 && Math.abs(i.y - 6) < 0.8)).toBe(false);
  });
});

describe("fäst mot objekt", () => {
  const table = (id: string, x: number, y: number): LayoutItem => ({ id, t: "rund150", x, y, r: 0, w: 1.5, d: 1.5, shape: "round", chairs: 8 });
  it("bord fäster med valt avstånd kant till kant", () => {
    const a = table("a", 0, 0);
    // 1,5 + 1,35 = 2,85 mellan mittpunkterna. Släpp nära.
    const res = snapToObjects(table("b", 2.9, 0.05), [a], 1.35);
    expect(res.dx).toBeCloseTo(-0.05);
    expect(res.dy).toBeCloseTo(-0.05);
    expect(res.guides.some((g) => g.label === "135 cm")).toBe(true);
  });
  it("fäster inte när det är långt ifrån", () => {
    const res = snapToObjects(table("b", 5, 3), [table("a", 0, 0)], 1.35);
    expect(res.dx).toBeNull();
    expect(res.dy).toBeNull();
  });
  it("vridna objekt räknas med rätt bredd", () => {
    expect(halfExtents({ w: 1.8, d: 0.8, r: 90 })).toEqual({ hw: expect.closeTo(0.4), hd: expect.closeTo(0.9) });
  });
  it("generatorn använder bordsavståndet", () => {
    const tt = [{ id: "rund150", name: "R", shape: "round", width_m: 1.5, depth_m: 1.5, default_chairs: 8, max_chairs: 10, stock: null, color: null, sort_order: 1, active: true }] as FurnitureType[];
    const res = generate({ width: 30, depth: 20, items: [] }, tt, { kind: "bankett", guests: 16, front: 2, margin: 1, aisle: 0, gap: 1.35 });
    const [p, q] = res.items;
    expect(Math.abs(q.x - p.x)).toBeCloseTo(2.85);
  });
});

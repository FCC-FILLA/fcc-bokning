import { describe, expect, it } from "vitest";
import { countItems, generate, parseItems, planFor, type FurnitureType } from "../src/lib/moblering";

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

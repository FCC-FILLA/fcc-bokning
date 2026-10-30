// Möbleringsritningar: datamodell, ställ-lista och generatorer för vanliga uppställningar.
// Allt är i meter. x/y är mittpunkten, r är vridning i grader. Scenen/fronten är upptill (y = 0).

export type Shape = "rect" | "round" | "chair" | "fixed";

export type FurnitureType = {
  id: string;
  name: string;
  shape: Shape;
  width_m: number;
  depth_m: number;
  default_chairs: number;
  max_chairs: number;
  stock: number | null;
  color: string | null;
  sort_order: number;
  active: boolean;
  supplier?: string | null;
};

export type LayoutItem = {
  id: string;
  t: string;
  x: number;
  y: number;
  r: number;
  w: number;
  d: number;
  shape: Shape;
  chairs?: number;
  /** Stolar på en eller två långsidor (rektangulära bord). */
  cs?: 1 | 2;
  label?: string;
};

export type Area = { x: number; y: number; w: number; h: number };
/** bg = planritning som bakgrund (täcker hela width × depth). area = golvytan som går att möblera (används av generatorn). */
/** Vikvägg/skjutvägg som kan vara stängd eller öppen. closed = standardläget för lokalen. */
export type Wall = { id: string; name: string; x1: number; y1: number; x2: number; y2: number; closed?: boolean };
export type RoomPlan = { width: number; depth: number; items: LayoutItem[]; bg?: string; area?: Area; walls?: Wall[] };

function parseWalls(v: unknown): Wall[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((w) => w && typeof w.id === "string" && [w.x1, w.y1, w.x2, w.y2].every((n) => Number.isFinite(Number(n))))
    .map((w) => ({
      id: String(w.id).slice(0, 40), name: String(w.name ?? w.id).slice(0, 60),
      x1: Number(w.x1), y1: Number(w.y1), x2: Number(w.x2), y2: Number(w.y2), closed: !!w.closed,
    }));
  return out.length ? out : undefined;
}

/** Vilka vikväggar som är stängda: ritningens eget val, annars lokalens standard. */
export function closedWalls(plan: RoomPlan, chosen: unknown): Set<string> {
  if (Array.isArray(chosen)) return new Set(chosen.filter((x): x is string => typeof x === "string"));
  return new Set((plan.walls ?? []).filter((w) => w.closed).map((w) => w.id));
}

function parseArea(v: unknown, width: number, depth: number): Area | undefined {
  const a = v as Partial<Area> | null;
  if (!a) return undefined;
  const x = Math.max(0, Number(a.x) || 0);
  const y = Math.max(0, Number(a.y) || 0);
  const w = Math.min(width - x, Number(a.w) || 0);
  const h = Math.min(depth - y, Number(a.h) || 0);
  return w > 0.5 && h > 0.5 ? { x, y, w, h } : undefined;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Grundritning för en lokal. Saknas den gissas en rektangel utifrån kvm. */
export function planFor(plan: unknown, kvm: number | null): RoomPlan {
  const p = plan as Partial<RoomPlan> | null;
  if (p && Number(p.width) > 0 && Number(p.depth) > 0) {
    const width = Number(p.width);
    const depth = Number(p.depth);
    return {
      width,
      depth,
      items: Array.isArray(p.items) ? (p.items as LayoutItem[]) : [],
      bg: typeof p.bg === "string" && /^\/ritningar\/[\w-]+\.(png|svg|jpg)$/.test(p.bg) ? p.bg : undefined,
      area: parseArea(p.area, width, depth),
      walls: parseWalls(p.walls),
    };
  }
  const area = kvm && kvm > 0 ? kvm : 300;
  const width = Math.max(4, Math.round(Math.sqrt(area * 1.4)));
  return { width, depth: Math.max(3, Math.round(area / width)), items: [] };
}

export function parseItems(v: unknown): LayoutItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === "object" && typeof x.t === "string" && Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y)))
    .map((x) => ({
      id: typeof x.id === "string" ? x.id : uid(),
      t: x.t,
      x: Number(x.x),
      y: Number(x.y),
      r: Number(x.r) || 0,
      w: Number(x.w) > 0 ? Number(x.w) : 1,
      d: Number(x.d) > 0 ? Number(x.d) : 1,
      shape: (["rect", "round", "chair", "fixed"].includes(x.shape) ? x.shape : "rect") as Shape,
      chairs: Number(x.chairs) > 0 ? Math.min(40, Math.round(Number(x.chairs))) : undefined,
      cs: x.cs === 1 ? 1 : x.cs === 2 ? 2 : undefined,
      label: typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, 60) : undefined,
    }));
}

export function newItem(t: FurnitureType, x: number, y: number, r = 0): LayoutItem {
  return {
    id: uid(),
    t: t.id,
    x: round2(x),
    y: round2(y),
    r,
    w: Number(t.width_m),
    d: Number(t.depth_m),
    shape: t.shape,
    chairs: t.default_chairs || undefined,
    cs: t.id === "skolbord" ? 1 : undefined,
  };
}

/** Ställ-lista: antal per möbeltyp och totalt antal stolar (både lösa och runt bord). */
export function countItems(items: LayoutItem[]) {
  const per = new Map<string, number>();
  let chairs = 0;
  for (const i of items) {
    if (i.t === "stol") chairs++;
    else per.set(i.t, (per.get(i.t) ?? 0) + 1);
    chairs += i.chairs ?? 0;
  }
  return { per, chairs };
}

/** Var stolarna runt ett bord står, relativt bordets mitt (före vridning). */
export function chairPositions(i: LayoutItem): { x: number; y: number; a: number }[] {
  const n = i.chairs ?? 0;
  if (!n) return [];
  const out: { x: number; y: number; a: number }[] = [];
  if (i.shape === "round") {
    const rad = i.w / 2 + 0.28;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 - Math.PI / 2;
      out.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, a: (a * 180) / Math.PI + 90 });
    }
    return out;
  }
  const sides = i.cs ?? 2;
  const back = sides === 1 ? n : Math.floor(n / 2);
  const front = n - back;
  const row = (count: number, y: number, a: number) => {
    for (let k = 0; k < count; k++) out.push({ x: -i.w / 2 + (i.w * (k + 0.5)) / count, y, a });
  };
  row(back, i.d / 2 + 0.28, 0);
  row(front, -i.d / 2 - 0.28, 180);
  return out;
}

/** Ytan som ett objekt tar, inklusive stolar (för att se om det får plats). */
export function footprint(i: LayoutItem) {
  if (i.shape === "round") return { w: i.w + (i.chairs ? 1.1 : 0), d: i.d + (i.chairs ? 1.1 : 0) };
  const extra = i.chairs ? ((i.cs ?? 2) === 1 ? 0.55 : 1.1) : 0;
  return { w: i.w, d: i.d + extra };
}

// ---------- Generatorer ----------

export type GenKind = "bankett" | "teater" | "klassrum" | "langbord" | "mingel";

export type GenOptions = {
  kind: GenKind;
  guests: number;
  /** Fri yta upptill för scen/front (m). */
  front: number;
  /** Marginal mot väggarna (m). */
  margin: number;
  /** Möbeltyp för borden (bankett, klassrum, långbord, mingel). */
  table?: string;
  /** Stolar per bord (bankett). */
  perTable?: number;
  /** Mittgång i meter (teater, klassrum), 0 = ingen. */
  aisle: number;
  /** Förskjut varannan rad (bankett). */
  stagger?: boolean;
};

export const GEN_LABEL: Record<GenKind, string> = {
  bankett: "Bankett (runda bord)",
  teater: "Teater / bio (stolsrader)",
  klassrum: "Klassrum (skolbord)",
  langbord: "Långbord",
  mingel: "Mingel (ståbord)",
};

/** Bygger en uppställning som fyller lokalen tills gästantalet nås eller ytan tar slut. */
export function generate(plan: RoomPlan, types: FurnitureType[], o: GenOptions): { items: LayoutItem[]; seats: number; full: boolean } {
  const type = (id: string | undefined, ...fallbacks: string[]) =>
    types.find((t) => t.id === id) ?? fallbacks.map((f) => types.find((t) => t.id === f)).find(Boolean)!;
  // Golvytan: lokalens markerade möblerbara yta, annars hela ritningen.
  const A = plan.area ?? { x: 0, y: 0, w: plan.width, h: plan.depth };
  const x0 = A.x + o.margin;
  const x1 = A.x + A.w - o.margin;
  const y0 = A.y + o.front;
  const y1 = A.y + A.h - o.margin;
  const mid = A.x + A.w / 2;
  const items: LayoutItem[] = [];
  let seats = 0;
  const need = Math.max(1, o.guests);
  // Fasta delar (pelare, fast scen …) får inte möbleras över. Enkel kontroll med omslutande rektanglar och 0,3 m luft.
  const obstacles = plan.items.map((f) => {
    const rot = Math.abs(Math.sin((f.r * Math.PI) / 180)) > 0.5;
    const w = rot ? f.d : f.w;
    const d = rot ? f.w : f.d;
    return { x0: f.x - w / 2 - 0.3, x1: f.x + w / 2 + 0.3, y0: f.y - d / 2 - 0.3, y1: f.y + d / 2 + 0.3 };
  });
  const free = (cx: number, cy: number, hw: number, hd: number) =>
    !obstacles.some((b) => cx + hw > b.x0 && cx - hw < b.x1 && cy + hd > b.y0 && cy - hd < b.y1);

  // Raka rader med valfri mittgång. cell = bredd per plats i raden, pitch = avstånd mellan rader.
  const rows = (cellW: number, pitch: number, place: (cx: number, cy: number) => number) => {
    const usable = x1 - x0 - (o.aisle > 0 ? o.aisle : 0);
    const perHalf = o.aisle > 0 ? Math.floor(usable / 2 / cellW) : Math.floor(usable / cellW);
    const per = o.aisle > 0 ? perHalf * 2 : perHalf;
    if (per <= 0) return;
    const blockW = perHalf * cellW;
    const starts = o.aisle > 0 ? [mid - o.aisle / 2 - blockW, mid + o.aisle / 2] : [mid - blockW / 2];
    for (let cy = y0 + pitch / 2; cy + pitch / 2 <= y1 + 0.001 && seats < need; cy += pitch) {
      for (const sx of starts) for (let k = 0; k < perHalf && seats < need; k++) seats += place(sx + cellW * (k + 0.5), cy);
    }
  };

  if (o.kind === "teater") {
    const chair = type("stol", "stol");
    rows(0.52, 0.95, (cx, cy) => {
      if (!free(cx, cy, 0.25, 0.25)) return 0;
      items.push(newItem(chair, cx, cy));
      return 1;
    });
  } else if (o.kind === "klassrum") {
    const t = type(o.table, "bord180", "skolbord");
    // En sida med stolar: ungefär 60 cm per person.
    const cap = Math.max(1, Math.floor(Number(t.width_m) / 0.6));
    rows(Number(t.width_m) + 0.05, Number(t.depth_m) + 1.0, (cx, cy) => {
      if (!free(cx, cy, Number(t.width_m) / 2, Number(t.depth_m) / 2 + 0.5)) return 0;
      const it = newItem(t, cx, cy - 0.25);
      it.cs = 1;
      it.chairs = Math.min(cap, need - seats);
      items.push(it);
      return it.chairs;
    });
  } else if (o.kind === "langbord") {
    const t = type(o.table, "bord180");
    const cap = Math.max(2, t.default_chairs || 6);
    // Bord i rad på längden (ända mot ända), raderna med 2,2 m mellanrum för stolar och passage.
    const pitch = Number(t.depth_m) + 2.2;
    const perRow = Math.floor((x1 - x0) / Number(t.width_m));
    for (let cy = y0 + pitch / 2; cy + pitch / 2 <= y1 + 0.001 && seats < need; cy += pitch) {
      const rowW = perRow * Number(t.width_m);
      for (let k = 0; k < perRow && seats < need; k++) {
        const cx = mid - rowW / 2 + Number(t.width_m) * (k + 0.5);
        if (!free(cx, cy, Number(t.width_m) / 2, Number(t.depth_m) / 2 + 0.6)) continue;
        const it = newItem(t, cx, cy);
        it.chairs = Math.min(cap, need - seats);
        items.push(it);
        seats += it.chairs;
      }
    }
  } else {
    const mingel = o.kind === "mingel";
    const t = mingel ? type(o.table, "stabord80", "stabord") : type(o.table, "rund150", "rund180");
    const per = mingel ? 0 : Math.max(1, Math.min(o.perTable ?? t.default_chairs ?? 8, t.max_chairs || 40));
    // Avstånd mitt till mitt: bordet + stolar på båda sidor + passage.
    const pitch = mingel ? 3.2 : Number(t.width_m) + 1.5;
    const guestsPer = mingel ? 8 : per;
    const r = mingel ? Number(t.width_m) / 2 : Number(t.width_m) / 2 + 0.6;
    let rowNo = 0;
    for (let cy = y0 + r; cy + r <= y1 + 0.001 && seats < need; cy += pitch * (o.stagger ? 0.87 : 1), rowNo++) {
      const off = o.stagger && rowNo % 2 ? pitch / 2 : 0;
      const n = Math.floor((x1 - x0 - 2 * r - off) / pitch) + 1;
      if (n <= 0) continue;
      const rowW = (n - 1) * pitch;
      const sx = mid - rowW / 2 + off / 2;
      for (let k = 0; k < n && seats < need; k++) {
        if (!free(sx + pitch * k, cy, r, r)) continue;
        const it = newItem(t, sx + pitch * k, cy);
        if (!mingel) it.chairs = Math.min(per, need - seats);
        items.push(it);
        seats += guestsPer;
      }
    }
    if (mingel) seats = Math.min(seats, need);
  }
  return { items, seats, full: seats < need };
}

export const fmtM = (n: number) => `${Number(n.toFixed(2)).toLocaleString("sv-SE")} m`;

/** Utsnitt att visa: golvytan plus allt som är ritat, med lite luft. Hela planen om inget finns. */
export function focusView(plan: RoomPlan, items: LayoutItem[], pad = 2): Area {
  const boxes = items.map((i) => {
    const r = Math.max(i.w, i.d) / 2 + (i.chairs ? 0.7 : 0);
    return { x0: i.x - r, y0: i.y - r, x1: i.x + r, y1: i.y + r };
  });
  if (plan.area) boxes.push({ x0: plan.area.x, y0: plan.area.y, x1: plan.area.x + plan.area.w, y1: plan.area.y + plan.area.h });
  if (!boxes.length) return { x: 0, y: 0, w: plan.width, h: plan.depth };
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x0)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y0)) - pad);
  const x1 = Math.min(plan.width, Math.max(...boxes.map((b) => b.x1)) + pad);
  const y1 = Math.min(plan.depth, Math.max(...boxes.map((b) => b.y1)) + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

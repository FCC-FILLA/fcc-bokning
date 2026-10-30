"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { LayoutDrawing } from "@/components/layout-drawing";
import {
  GEN_LABEL, countItems, focusView, generate, newItem, uid,
  type FurnitureType, type GenKind, type LayoutItem, type RoomPlan,
} from "@/lib/moblering";

type Drag =
  | { kind: "move"; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: "box"; start: { x: number; y: number }; add: boolean; base: Set<string> };

type Props = {
  mode: "layout" | "room";
  plan: RoomPlan;
  initial: LayoutItem[];
  types: FurnitureType[];
  action: (fd: FormData) => void | Promise<void>;
  readOnly?: boolean;
  /** Platser enligt lokalens kapacitet per möblering. */
  capacities?: Record<string, number>;
  setups?: { id: string; name: string }[];
  fields?: { name: string; setup_id: string | null; notes: string | null; staff_visible: boolean };
  guests?: number | null;
  kvm?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function LayoutEditor({ mode, plan: initialPlan, initial, types, action, readOnly, capacities = {}, setups = [], fields, guests, kvm }: Props) {
  const roomMode = mode === "room";
  const [items, setItems] = useState<LayoutItem[]>(initial);
  const [dims, setDims] = useState({ width: initialPlan.width, depth: initialPlan.depth });
  const [area, setArea] = useState(initialPlan.area);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useState(0.1);
  // Hela våningsplanet är ritat; börja inzoomat på lokalens golvyta (eller det som redan är möblerat).
  const startView = useMemo(() => focusView(initialPlan, initial, 3), [initialPlan, initial]);
  const [zoom, setZoom] = useState(() => Math.min(6, Math.max(1, Math.round(((initialPlan.width + 2.4) / startView.w) * 2) / 2)));
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom === 1) return;
    el.scrollLeft = ((startView.x + 1.2) / (initialPlan.width + 2.4)) * el.scrollWidth;
    el.scrollTop = ((startView.y + 1.2) / (initialPlan.depth + 2.4)) * el.scrollHeight;
    // Bara vid start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [numbers, setNumbers] = useState(true);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [setupId, setSetupId] = useState(fields?.setup_id ?? "");
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const past = useRef<LayoutItem[][]>([]);
  const future = useRef<LayoutItem[][]>([]);
  const [saved] = useState(() => JSON.stringify({ items: initial, dims: { width: initialPlan.width, depth: initialPlan.depth }, area: initialPlan.area }));
  const [submitting, setSubmitting] = useState(false);

  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const colors = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t.color])), [types]);
  const names = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t.name])), [types]);
  const palette = types.filter((t) => t.active && (roomMode ? t.shape === "fixed" || t.id === "scen" : t.shape !== "fixed"));
  const plan: RoomPlan = roomMode ? { ...initialPlan, width: dims.width, depth: dims.depth, items: [], area } : initialPlan;
  const dirty = JSON.stringify({ items, dims, area }) !== saved;
  // Med planritning som bakgrund är proportionerna låsta: ändrad bredd = ändrad skala, och allt ritat följer med.
  const rescale = (width: number) => {
    const f = width / dims.width;
    if (!Number.isFinite(f) || f <= 0) return;
    setDims({ width, depth: r2(dims.depth * f) });
    setArea((a) => (a ? { x: r2(a.x * f), y: r2(a.y * f), w: r2(a.w * f), h: r2(a.h * f) } : a));
    commit((prev) => prev.map((i) => ({ ...i, x: r2(i.x * f), y: r2(i.y * f) })));
  };
  const setAreaField = (k: "x" | "y" | "w" | "h", v: number) =>
    setArea((a) => ({ ...(a ?? { x: 0, y: 0, w: dims.width, h: dims.depth }), [k]: Math.max(0, v) }));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty && !submitting) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);

  const commit = useCallback((next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {
    setItems((prev) => {
      past.current.push(prev);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      return typeof next === "function" ? next(prev) : next;
    });
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setItems((cur) => { future.current.push(cur); return prev; });
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setItems((cur) => { past.current.push(cur); return next; });
  }, []);

  const toMeters = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const snapTo = (n: number) => (snap > 0 ? Math.round(n / snap) * snap : n);

  const add = (t: FurnitureType) => {
    const n = items.length % 6;
    const it = newItem(t, r2(plan.width / 2 + (n - 3) * 0.6), r2(Math.min(plan.depth - 1, 2 + n * 0.6)));
    commit((prev) => [...prev, it]);
    setSelected(new Set([it.id]));
  };

  const onItemDown = (e: RPointerEvent<SVGGElement>, id: string) => {
    if (readOnly) return;
    e.stopPropagation();
    let sel = selected;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      sel = new Set(selected);
      if (sel.has(id)) sel.delete(id); else sel.add(id);
      setSelected(sel);
      return;
    }
    if (!sel.has(id)) { sel = new Set([id]); setSelected(sel); }
    const orig = new Map(items.filter((i) => sel.has(i.id)).map((i) => [i.id, { x: i.x, y: i.y }]));
    drag.current = { kind: "move", start: toMeters(e), orig, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBgDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    drag.current = { kind: "box", start: toMeters(e), add, base: add ? new Set(selected) : new Set() };
    if (!add) setSelected(new Set());
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toMeters(e);
    if (d.kind === "move") {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 0.05) return;
      if (!d.moved) { past.current.push(items); future.current = []; d.moved = true; }
      setItems((prev) => prev.map((i) => {
        const o = d.orig.get(i.id);
        return o ? { ...i, x: r2(snapTo(o.x + dx)), y: r2(snapTo(o.y + dy)) } : i;
      }));
    } else {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setMarquee(box);
      const inside = items.filter((i) => i.x >= box.x && i.x <= box.x + box.w && i.y >= box.y && i.y <= box.y + box.h).map((i) => i.id);
      setSelected(new Set([...d.base, ...inside]));
    }
  };
  const onUp = () => { drag.current = null; setMarquee(null); };

  const selItems = items.filter((i) => selected.has(i.id));
  const update = (patch: Partial<LayoutItem>) => commit((prev) => prev.map((i) => (selected.has(i.id) ? { ...i, ...patch } : i)));
  const rotate = (deg: number) => commit((prev) => prev.map((i) => (selected.has(i.id) ? { ...i, r: (((i.r + deg) % 360) + 360) % 360 } : i)));
  const remove = () => { commit((prev) => prev.filter((i) => !selected.has(i.id))); setSelected(new Set()); };
  const duplicate = () => {
    const copies = selItems.map((i) => ({ ...i, id: uid(), x: r2(i.x + 0.5), y: r2(i.y + 0.5) }));
    commit((prev) => [...prev, ...copies]);
    setSelected(new Set(copies.map((c) => c.id)));
  };
  const nudge = (dx: number, dy: number) => commit((prev) => prev.map((i) => (selected.has(i.id) ? { ...i, x: r2(i.x + dx), y: r2(i.y + dy) } : i)));
  const align = (axis: "x" | "y") => {
    if (selItems.length < 2) return;
    const v = r2(selItems.reduce((s, i) => s + i[axis], 0) / selItems.length);
    update({ [axis]: v } as Partial<LayoutItem>);
  };
  const distribute = (axis: "x" | "y") => {
    if (selItems.length < 3) return;
    const sorted = [...selItems].sort((a, b) => a[axis] - b[axis]);
    const first = sorted[0][axis];
    const step = (sorted[sorted.length - 1][axis] - first) / (sorted.length - 1);
    const pos = new Map(sorted.map((i, n) => [i.id, r2(first + step * n)]));
    commit((prev) => prev.map((i) => (pos.has(i.id) ? { ...i, [axis]: pos.get(i.id)! } : i)));
  };

  useEffect(() => {
    if (readOnly) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(new Set(items.map((i) => i.id))); return; }
      if (!selected.size) return;
      const step = e.shiftKey ? 1 : 0.1;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (e.key === "Escape") setSelected(new Set());
      else if (e.key.toLowerCase() === "r") rotate(e.shiftKey ? -15 : 15);
      else if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---------- Generator ----------
  const [gen, setGen] = useState({ kind: "bankett" as GenKind, guests: guests ?? 100, front: 3, margin: 1, table: "", perTable: 0, aisle: 1.2, stagger: false });
  const tableChoices = (k: GenKind) =>
    types.filter((t) => t.active && (k === "bankett" ? t.shape === "round" && t.default_chairs > 0 : k === "mingel" ? t.shape === "round" : k === "teater" ? false : t.shape === "rect" && t.default_chairs > 0));
  const runGen = () => {
    const res = generate({ ...plan, items: initialPlan.items }, types, {
      ...gen, table: gen.table || undefined, perTable: gen.perTable || undefined,
    });
    commit(res.items);
    setSelected(new Set());
    setGenMsg(res.full ? `Fick bara plats med ${res.seats} av ${gen.guests} gäster. Minska marginalerna eller välj en annan uppställning.` : `Klart: ${res.seats} platser. Justera fritt, eller ångra med Ctrl+Z.`);
  };

  // ---------- Ställ-lista ----------
  const { per, chairs } = countItems(items);
  const cap = setupId ? capacities[setupId] : undefined;
  const floor = kvm ?? plan.width * plan.depth;
  const one = selItems.length === 1 ? selItems[0] : null;
  const oneType = one ? byId.get(one.t) : null;

  return (
    <form
      action={action}
      onSubmit={() => setSubmitting(true)}
      className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px] items-start"
    >
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      {/* Möbler */}
      <aside className="card p-3 grid gap-2 print:hidden lg:sticky lg:top-28">
        <h2 className="font-semibold text-sm">{roomMode ? "Fasta delar" : "Möbler"}</h2>
        <p className="text-xs text-muted">Klicka för att lägga till, dra för att flytta.</p>
        <div className="grid gap-1">
          {palette.map((t) => (
            <button key={t.id} type="button" disabled={readOnly} onClick={() => add(t)}
              className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-sm hover:bg-sunk disabled:opacity-50">
              <span aria-hidden className={`inline-block size-4 shrink-0 border border-fg/40 ${t.shape === "round" ? "rounded-full" : "rounded-sm"}`}
                style={{ background: t.color ?? (t.shape === "chair" ? "#cdbcae" : "#fff") }} />
              <span className="flex-1">{t.name}</span>
              {t.supplier && <span className="text-[10px] uppercase text-muted">hyrs</span>}
            </button>
          ))}
        </div>
        {roomMode && (
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
            <input type="hidden" name="area" value={area ? JSON.stringify(area) : ""} />
            <input type="hidden" name="bg" value={initialPlan.bg ?? ""} />
            {initialPlan.bg ? (
              <>
                <input type="hidden" name="depth" value={dims.depth} />
                <div className="field col-span-2"><label className="label" htmlFor="plan-w">Ritningens bredd (m)</label>
                  <input className="input" id="plan-w" name="width" type="number" step="0.1" min={2} max={200} defaultValue={dims.width}
                    onBlur={(e) => { const v = Number(e.target.value); if (v >= 2 && v !== dims.width) rescale(v); }} />
                  <span className="text-xs text-muted">Skalan är räknad från scenpodierna i Stora salen (2 × 1 m). Ändrar du bredden skalas allt om.</span></div>
              </>
            ) : (
              <>
                <div className="field"><label className="label" htmlFor="plan-w">Bredd (m)</label>
                  <input className="input" id="plan-w" name="width" type="number" step="0.5" min={2} max={200} value={dims.width}
                    onChange={(e) => setDims((d) => ({ ...d, width: Math.max(2, Number(e.target.value) || 2) }))} /></div>
                <div className="field"><label className="label" htmlFor="plan-d">Djup (m)</label>
                  <input className="input" id="plan-d" name="depth" type="number" step="0.5" min={2} max={200} value={dims.depth}
                    onChange={(e) => setDims((d) => ({ ...d, depth: Math.max(2, Number(e.target.value) || 2) }))} /></div>
              </>
            )}
            <p className="col-span-2 text-xs font-semibold mt-1">Möblerbar golvyta</p>
            {(["x", "y", "w", "h"] as const).map((k) => (
              <div key={k} className="field"><label className="label" htmlFor={`area-${k}`}>{{ x: "Från vänster", y: "Från ovan", w: "Bredd", h: "Djup" }[k]}</label>
                <input className="input" id={`area-${k}`} type="number" step="0.1" min={0} value={area?.[k] ?? (k === "w" ? dims.width : k === "h" ? dims.depth : 0)}
                  onChange={(e) => setAreaField(k, Number(e.target.value) || 0)} /></div>
            ))}
            <p className="col-span-2 text-xs text-muted">Den streckade ytan fylls när man väljer Fyll automatiskt. Fronten (scenen) ligger upptill.{kvm ? ` Lokalen är ${kvm} kvm.` : ""}</p>
          </div>
        )}
      </aside>

      {/* Ritytan */}
      <div className="grid gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" className="btn btn-ghost px-2" onClick={undo} disabled={readOnly} title="Ångra (Ctrl+Z)">↶ Ångra</button>
          <button type="button" className="btn btn-ghost px-2" onClick={redo} disabled={readOnly} title="Gör om (Ctrl+Shift+Z)">↷</button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className="btn btn-ghost px-2" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zooma ut">−</button>
          <span className="text-sm tabular-nums w-12 text-center">{Math.round(zoom * 100)} %</span>
          <button type="button" className="btn btn-ghost px-2" onClick={() => setZoom((z) => Math.min(6, z + 0.5))} aria-label="Zooma in">+</button>
          <label className="flex items-center gap-1.5 text-sm ml-2">Fäst mot
            <select className="input h-8 py-0 text-sm w-24" value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
              <option value={0}>fritt</option><option value={0.1}>10 cm</option><option value={0.25}>25 cm</option><option value={0.5}>50 cm</option><option value={1}>1 m</option>
            </select>
          </label>
          {!roomMode && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> Bordsnummer</label>}
          <span className="flex-1" />
          {dirty && !readOnly && <span className="text-sm text-warn">Ej sparat</span>}
        </div>
        <div ref={scrollRef} className="card overflow-auto max-h-[78vh] p-0">
          <LayoutDrawing
            plan={plan}
            items={items}
            colors={colors}
            names={names}
            selected={selected}
            numbers={numbers && !roomMode}
            marquee={marquee}
            svgRef={svgRef}
            onItemDown={readOnly ? undefined : onItemDown}
            onBgDown={readOnly ? undefined : onBgDown}
            onMove={onMove}
            onUp={onUp}
            className="block select-none"
            title={fields?.name}
            widthPct={zoom * 100}
            showArea={roomMode || items.length === 0}
          />
        </div>
        <p className="text-xs text-muted print:hidden">
          Dra en ruta på golvet för att markera flera. Shift-klick lägger till. Piltangenter flyttar 10 cm (med Shift 1 m), R vrider 15°, Ctrl+D kopierar, Delete tar bort.
        </p>
      </div>

      {/* Höger: egenskaper, generator, ställ-lista, spara */}
      <aside className="grid gap-3 print:hidden lg:sticky lg:top-28 max-h-none">
        {selItems.length > 0 && !readOnly && (
          <section className="card p-3 grid gap-2">
            <h2 className="font-semibold text-sm">{one ? oneType?.name ?? "Objekt" : `${selItems.length} markerade`}</h2>
            {one && (
              <>
                <div className="field"><label className="label" htmlFor="it-label">Text på ritningen</label>
                  <input className="input" id="it-label" value={one.label ?? ""} placeholder={one.shape === "round" || one.shape === "rect" ? "t.ex. Bord 1, Brudpar" : ""}
                    onChange={(e) => update({ label: e.target.value || undefined })} /></div>
                {(one.shape === "round" || one.shape === "rect") && !roomMode && ((oneType?.max_chairs ?? 0) > 0 || (one.chairs ?? 0) > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="field"><label className="label" htmlFor="it-ch">Stolar</label>
                      <input className="input" id="it-ch" type="number" min={0} max={oneType?.max_chairs || 40} value={one.chairs ?? 0}
                        onChange={(e) => update({ chairs: Math.max(0, Math.min(40, Number(e.target.value) || 0)) || undefined })} /></div>
                    {one.shape === "rect" && (
                      <div className="field"><label className="label" htmlFor="it-cs">Stolar på</label>
                        <select className="input" id="it-cs" value={one.cs ?? 2} onChange={(e) => update({ cs: Number(e.target.value) as 1 | 2 })}>
                          <option value={2}>båda sidor</option><option value={1}>en sida</option>
                        </select></div>
                    )}
                  </div>
                )}
                {one.shape !== "chair" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="field"><label className="label" htmlFor="it-w">{one.shape === "round" ? "Diameter" : "Bredd"} (m)</label>
                      <input className="input" id="it-w" type="number" step="0.1" min={0.2} value={one.w}
                        onChange={(e) => update(one.shape === "round" ? { w: Number(e.target.value) || one.w, d: Number(e.target.value) || one.d } : { w: Number(e.target.value) || one.w })} /></div>
                    {one.shape !== "round" && (
                      <div className="field"><label className="label" htmlFor="it-d">Djup (m)</label>
                        <input className="input" id="it-d" type="number" step="0.1" min={0.1} value={one.d} onChange={(e) => update({ d: Number(e.target.value) || one.d })} /></div>
                    )}
                  </div>
                )}
                <div className="field"><label className="label" htmlFor="it-r">Vridning (°)</label>
                  <input className="input" id="it-r" type="number" step="15" value={one.r} onChange={(e) => update({ r: Number(e.target.value) || 0 })} /></div>
              </>
            )}
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn btn-ghost px-2 text-sm" onClick={() => rotate(90)}>Vrid 90°</button>
              <button type="button" className="btn btn-ghost px-2 text-sm" onClick={duplicate}>Kopiera</button>
              <button type="button" className="btn btn-ghost px-2 text-sm text-warn" onClick={remove}>Ta bort</button>
            </div>
            {selItems.length > 1 && (
              <div className="flex flex-wrap gap-1 border-t border-line pt-2">
                <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => align("y")}>Samma rad</button>
                <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => align("x")}>Samma kolumn</button>
                <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => distribute("x")} disabled={selItems.length < 3}>Jämna ut ↔</button>
                <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => distribute("y")} disabled={selItems.length < 3}>Jämna ut ↕</button>
              </div>
            )}
          </section>
        )}

        {!roomMode && !readOnly && (
          <details className="card p-3 grid gap-2" open={items.length === 0}>
            <summary className="cursor-pointer font-semibold text-sm">Fyll automatiskt</summary>
            <div className="grid gap-2 mt-2">
              <div className="field"><label className="label" htmlFor="g-kind">Uppställning</label>
                <select className="input" id="g-kind" value={gen.kind} onChange={(e) => setGen((g) => ({ ...g, kind: e.target.value as GenKind, table: "" }))}>
                  {(Object.keys(GEN_LABEL) as GenKind[]).map((k) => <option key={k} value={k}>{GEN_LABEL[k]}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="field"><label className="label" htmlFor="g-guests">Gäster</label>
                  <input className="input" id="g-guests" type="number" min={1} max={5000} value={gen.guests} onChange={(e) => setGen((g) => ({ ...g, guests: Number(e.target.value) || 1 }))} /></div>
                {tableChoices(gen.kind).length > 0 && (
                  <div className="field"><label className="label" htmlFor="g-table">Bord</label>
                    <select className="input" id="g-table" value={gen.table} onChange={(e) => setGen((g) => ({ ...g, table: e.target.value }))}>
                      <option value="">Standard</option>
                      {tableChoices(gen.kind).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select></div>
                )}
                {gen.kind === "bankett" && (
                  <div className="field"><label className="label" htmlFor="g-per">Per bord</label>
                    <input className="input" id="g-per" type="number" min={0} max={14} value={gen.perTable || ""} placeholder="standard" onChange={(e) => setGen((g) => ({ ...g, perTable: Number(e.target.value) || 0 }))} /></div>
                )}
                <div className="field"><label className="label" htmlFor="g-front">Fritt framme (m)</label>
                  <input className="input" id="g-front" type="number" step="0.5" min={0} value={gen.front} onChange={(e) => setGen((g) => ({ ...g, front: Math.max(0, Number(e.target.value) || 0) }))} /></div>
                <div className="field"><label className="label" htmlFor="g-margin">Mot väggar (m)</label>
                  <input className="input" id="g-margin" type="number" step="0.5" min={0} value={gen.margin} onChange={(e) => setGen((g) => ({ ...g, margin: Math.max(0, Number(e.target.value) || 0) }))} /></div>
                {(gen.kind === "teater" || gen.kind === "klassrum") && (
                  <div className="field"><label className="label" htmlFor="g-aisle">Mittgång (m)</label>
                    <input className="input" id="g-aisle" type="number" step="0.1" min={0} value={gen.aisle} onChange={(e) => setGen((g) => ({ ...g, aisle: Math.max(0, Number(e.target.value) || 0) }))} /></div>
                )}
              </div>
              {(gen.kind === "bankett" || gen.kind === "mingel") && (
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={gen.stagger} onChange={(e) => setGen((g) => ({ ...g, stagger: e.target.checked }))} /> Förskjut varannan rad</label>
              )}
              <button type="button" className="btn" onClick={runGen}>{items.length ? "Ersätt med ny uppställning" : "Skapa uppställning"}</button>
              {genMsg && <p className="text-xs text-muted">{genMsg}</p>}
            </div>
          </details>
        )}

        {!roomMode && (
          <section className="card p-3 grid gap-2">
            <h2 className="font-semibold text-sm">Ställ-lista</h2>
            <ul className="grid gap-0.5 text-sm">
              {[...per].sort((a, b) => (byId.get(a[0])?.sort_order ?? 99) - (byId.get(b[0])?.sort_order ?? 99)).map(([t, n]) => {
                const stock = byId.get(t)?.stock;
                return (
                  <li key={t} className="flex gap-2">
                    <span className="flex-1">{names[t] ?? t}</span>
                    <span className={`tabular-nums font-semibold ${stock != null && n > stock ? "text-warn" : ""}`}>{n}</span>
                    {stock != null && <span className={`text-xs tabular-nums w-14 text-right ${n > stock ? "text-warn" : "text-muted"}`}>av {stock}</span>}
                  </li>
                );
              })}
              <li className="flex gap-2 border-t border-line pt-1 mt-1">
                <span className="flex-1">Stolar</span>
                <span className={`tabular-nums font-semibold ${byId.get("stol")?.stock != null && chairs > byId.get("stol")!.stock! ? "text-warn" : ""}`}>{chairs}</span>
                {byId.get("stol")?.stock != null && <span className="text-xs tabular-nums w-14 text-right text-muted">av {byId.get("stol")!.stock}</span>}
              </li>
            </ul>
            <div className="grid gap-0.5 text-xs text-muted">
              {guests ? <p className={chairs < guests ? "text-warn" : ""}>Evenemanget har {guests} gäster{chairs < guests ? ` – ${guests - chairs} platser saknas` : ""}.</p> : null}
              {cap ? <p className={chairs > cap ? "text-warn font-semibold" : ""}>Lokalens kapacitet för möbleringen: {cap}{chairs > cap ? " – ritningen har fler platser!" : ""}.</p> : null}
              {chairs > 0 && floor ? <p>{(floor / chairs).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kvm per sittplats.</p> : null}
            </div>
          </section>
        )}

        {!readOnly && (
          <section className="card p-3 grid gap-2">
            {fields && (
              <>
                <div className="field"><label className="label" htmlFor="l-name">Namn</label>
                  <input className="input" id="l-name" name="name" required defaultValue={fields.name} /></div>
                <div className="field"><label className="label" htmlFor="l-setup">Möblering</label>
                  <select className="input" id="l-setup" name="setup_id" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
                    <option value="">Ingen vald</option>
                    {setups.map((s) => <option key={s.id} value={s.id}>{s.name}{capacities[s.id] ? ` (max ${capacities[s.id]})` : ""}</option>)}
                  </select></div>
                <div className="field"><label className="label" htmlFor="l-notes">Instruktioner till personalen</label>
                  <textarea className="input min-h-24" id="l-notes" name="notes" defaultValue={fields.notes ?? ""} placeholder="T.ex. vita dukar, servetter i glaset, 2 m fritt framför nödutgångar" /></div>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="staff_visible" defaultChecked={fields.staff_visible} /> Visa på personalens pass</label>
              </>
            )}
            <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Sparar …" : "Spara ritningen"}</button>
          </section>
        )}
      </aside>
    </form>
  );
}

import type { PointerEvent as RPointerEvent, Ref } from "react";
import { chairPositions, type Guide, type LayoutItem, type RoomPlan } from "@/lib/moblering";

const TABLE_FILL = "#ffffff";
const TABLE_STROKE = "#60272b";
const CHAIR_FILL = "#cdbcae";
const SEL = "#2563eb";

/** Bord numreras uppifrån och ned, vänster till höger, så att personal och placeringslistor kan hänvisa till "bord 7". */
export function tableNumbers(items: LayoutItem[]) {
  const tables = items.filter((i) => (i.shape === "round" || i.shape === "rect") && (i.chairs ?? 0) > 0);
  const sorted = [...tables].sort((a, b) => Math.round(a.y * 2) - Math.round(b.y * 2) || a.x - b.x);
  return new Map(sorted.map((t, n) => [t.id, n + 1]));
}

function isDark(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return false;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

type Props = {
  plan: RoomPlan;
  items: LayoutItem[];
  colors?: Record<string, string | null>;
  names?: Record<string, string>;
  selected?: Set<string>;
  numbers?: boolean;
  grid?: boolean;
  /** Fasta saker (från grundritningen) går att välja – bara när man ritar själva lokalen. */
  editFixed?: boolean;
  marquee?: { x: number; y: number; w: number; h: number } | null;
  svgRef?: Ref<SVGSVGElement>;
  onItemDown?: (e: RPointerEvent<SVGGElement>, id: string) => void;
  onBgDown?: (e: RPointerEvent<SVGSVGElement>) => void;
  onMove?: (e: RPointerEvent<SVGSVGElement>) => void;
  onUp?: (e: RPointerEvent<SVGSVGElement>) => void;
  className?: string;
  title?: string;
  /** Bredd i procent av behållaren (zoom). */
  widthPct?: number;
  /** Stängda vikväggar (id). Utan detta gäller lokalens standard. */
  closed?: Set<string>;
  /** Visa bara detta utsnitt (meter). */
  view?: { x: number; y: number; w: number; h: number };
  /** Visa den möblerbara golvytan streckad. */
  showArea?: boolean;
  /** Hjälplinjer när ett objekt fäster mot ett annat. */
  guides?: Guide[];
};

export function LayoutDrawing({
  plan, items, colors = {}, names = {}, selected, numbers = true, grid = true, editFixed = false, marquee, svgRef,
  onItemDown, onBgDown, onMove, onUp, className, title, widthPct = 100, showArea = false, view, closed, guides,
}: Props) {
  const W = plan.width;
  const D = plan.depth;
  const pad = 1.2;
  const nums = numbers ? tableNumbers(items) : new Map<string, number>();
  const lines: React.ReactNode[] = [];
  if (grid) {
    for (let x = 1; x < W; x++) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={D} stroke={x % 5 ? "#efe7e1" : "#dccfc6"} strokeWidth={0.03} />);
    for (let y = 1; y < D; y++) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} stroke={y % 5 ? "#efe7e1" : "#dccfc6"} strokeWidth={0.03} />);
  }
  const fs = Math.max(0.3, Math.min(0.6, Math.max(view?.w ?? W, view?.h ?? D) / 60));

  const draw = (i: LayoutItem, fixed: boolean) => {
    const sel = selected?.has(i.id);
    const color = colors[i.t] ?? null;
    const interactive = !!onItemDown && (!fixed || editFixed);
    const roomy = i.w >= 1.5 && i.d >= 0.6;
    const label = i.label ?? (nums.get(i.id) != null ? String(nums.get(i.id)) : roomy && (i.shape === "fixed" || (i.shape === "rect" && color)) ? names[i.t] ?? "" : "");
    let body: React.ReactNode;
    if (i.shape === "round") {
      body = <circle r={i.w / 2} fill={color ?? TABLE_FILL} stroke={sel ? SEL : TABLE_STROKE} strokeWidth={sel ? 0.08 : 0.05} />;
    } else if (i.shape === "chair") {
      const cw = Math.min(i.w, 0.7) * 0.88;
      const cd = Math.min(i.d, 0.7) * 0.8;
      body = <rect x={-cw / 2} y={-cd / 2} width={cw} height={cd} rx={0.08} fill={sel ? "#93b4f5" : CHAIR_FILL} stroke={sel ? SEL : "#9c8676"} strokeWidth={0.03} />;
    } else {
      const f = color ?? (i.shape === "fixed" ? "#666" : TABLE_FILL);
      body = <rect x={-i.w / 2} y={-i.d / 2} width={i.w} height={i.d} rx={i.shape === "fixed" ? 0 : 0.04} fill={f} stroke={sel ? SEL : i.shape === "fixed" ? "none" : TABLE_STROKE} strokeWidth={sel ? 0.08 : 0.05} />;
    }
    const dark = !!color && isDark(color);
    return (
      <g
        key={i.id}
        transform={`translate(${i.x} ${i.y}) rotate(${i.r})`}
        onPointerDown={interactive ? (e) => onItemDown!(e, i.id) : undefined}
        style={interactive ? { cursor: "move" } : undefined}
        data-id={i.id}
      >
        {chairPositions(i).map((c, k) => (
          <rect key={k} x={c.x - 0.2} y={c.y - 0.18} width={0.4} height={0.36} rx={0.08} fill={CHAIR_FILL} stroke="#9c8676" strokeWidth={0.025} transform={`rotate(${c.a} ${c.x} ${c.y})`} />
        ))}
        {body}
        {label && (
          <text
            transform={`rotate(${-i.r})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={i.shape === "fixed" || i.shape === "rect" ? Math.min(fs, i.d * 0.8 + 0.15) : fs}
            fontWeight={600}
            fill={dark || i.shape === "fixed" ? "#fff" : "#2a1c1d"}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
        )}
        {sel && i.shape !== "round" && (
          <rect x={-i.w / 2 - 0.12} y={-i.d / 2 - 0.12} width={i.w + 0.24} height={i.d + 0.24} fill="none" stroke={SEL} strokeWidth={0.04} strokeDasharray="0.15 0.1" />
        )}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`}
      className={className}
      role="img"
      aria-label={title ?? "Möbleringsritning"}
      onPointerDown={onBgDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{ touchAction: onItemDown ? "none" : undefined, background: "#fff", width: `${widthPct}%`, height: "auto" }}
    >
      {plan.bg ? (
        <>
          <rect x={0} y={0} width={W} height={D} fill="#fff" />
          <image href={plan.bg} x={0} y={0} width={W} height={D} preserveAspectRatio="none" style={{ pointerEvents: "none" }} />
          <g opacity={0.45}>{lines}</g>
          <rect x={0} y={0} width={W} height={D} fill="none" stroke="#d6cbc3" strokeWidth={0.06} />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={W} height={D} fill="#fbf8f5" stroke="#2a1c1d" strokeWidth={0.1} />
          {lines}
        </>
      )}
      {(plan.walls ?? []).map((w) => {
        const shut = closed ? closed.has(w.id) : !!w.closed;
        return (
          <g key={w.id} style={{ pointerEvents: "none" }}>
            <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={shut ? "#2a1c1d" : "#60272b"} strokeWidth={shut ? 0.22 : 0.06}
              strokeDasharray={shut ? undefined : "0.35 0.25"} opacity={shut ? 1 : 0.6} strokeLinecap="round" />
          </g>
        );
      })}
      {plan.area && showArea && (
        <rect x={plan.area.x} y={plan.area.y} width={plan.area.w} height={plan.area.h} fill="rgba(96,39,43,.05)" stroke="#60272b" strokeWidth={0.08} strokeDasharray="0.4 0.25" style={{ pointerEvents: "none" }} />
      )}
      <text x={W / 2} y={-pad / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fill="#7a6466" letterSpacing={0.1}>
        FRONT / SCEN
      </text>
      <text x={W / 2} y={D + pad / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs * 0.85} fill="#7a6466">
        {plan.bg ? "rutor 1 m" : `${W.toLocaleString("sv-SE")} m × ${D.toLocaleString("sv-SE")} m · rutor 1 m`}
      </text>
      {plan.items.map((i) => draw(i, true))}
      {items.map((i) => draw(i, false))}
      {guides?.map((g, k) => (
        <g key={`g${k}`} style={{ pointerEvents: "none" }}>
          <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#e11d48" strokeWidth={0.04} strokeDasharray={g.label ? undefined : "0.15 0.1"} />
          {g.label && (
            <text x={(g.x1 + g.x2) / 2} y={(g.y1 + g.y2) / 2 - 0.18} textAnchor="middle" fontSize={0.3} fontWeight={700} fill="#e11d48" stroke="#fff" strokeWidth={0.06} paintOrder="stroke">
              {g.label}
            </text>
          )}
        </g>
      ))}
      {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(37,99,235,.08)" stroke={SEL} strokeWidth={0.04} strokeDasharray="0.2 0.1" />}
    </svg>
  );
}

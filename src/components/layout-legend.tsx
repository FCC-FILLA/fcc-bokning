import { countItems, ownerText, sizeText, type FurnitureType, type LayoutItem, type Shape } from "@/lib/moblering";

export type LegendType = Pick<FurnitureType, "id" | "name" | "color" | "sort_order"> &
  Partial<Pick<FurnitureType, "shape" | "width_m" | "depth_m" | "supplier" | "stock">>;

const CHAIR = "#cdbcae";
const STROKE = "#60272b";

/** Liten symbol som ser ut som objektet på ritningen. */
export function LegendSymbol({ shape, color, chairs, size = 28 }: { shape: Shape; color?: string | null; chairs?: number; size?: number }) {
  const n = Math.min(chairs ?? 0, 10);
  const parts: React.ReactNode[] = [];
  if (shape === "round") {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * 0.78;
      const y = Math.sin(a) * 0.78;
      parts.push(<rect key={k} x={x - 0.14} y={y - 0.12} width={0.28} height={0.24} rx={0.06} fill={CHAIR} stroke="#9c8676" strokeWidth={0.03}
        transform={`rotate(${(a * 180) / Math.PI + 90} ${x} ${y})`} />);
    }
    parts.push(<circle key="t" r={n ? 0.55 : 0.8} fill={color ?? "#fff"} stroke={STROKE} strokeWidth={0.07} />);
  } else if (shape === "chair") {
    parts.push(<rect key="c" x={-0.45} y={-0.4} width={0.9} height={0.8} rx={0.15} fill={CHAIR} stroke="#9c8676" strokeWidth={0.06} />);
  } else if (shape === "fixed") {
    parts.push(<rect key="f" x={-0.85} y={-0.5} width={1.7} height={1} fill={color ?? "#666"} />);
  } else {
    const per = Math.min(Math.ceil(n / 2), 4);
    for (let k = 0; k < per; k++) {
      const x = -0.9 + (1.8 * (k + 0.5)) / per;
      parts.push(<rect key={`a${k}`} x={x - 0.13} y={-0.78} width={0.26} height={0.22} rx={0.05} fill={CHAIR} stroke="#9c8676" strokeWidth={0.03} />);
      if (n > 1) parts.push(<rect key={`b${k}`} x={x - 0.13} y={0.56} width={0.26} height={0.22} rx={0.05} fill={CHAIR} stroke="#9c8676" strokeWidth={0.03} />);
    }
    parts.push(<rect key="t" x={-0.95} y={-0.42} width={1.9} height={0.84} rx={0.05} fill={color ?? "#fff"} stroke={STROKE} strokeWidth={0.07} />);
  }
  return (
    <svg viewBox="-1 -1 2 2" width={size} height={size} aria-hidden className="shrink-0">
      {parts}
    </svg>
  );
}

/**
 * Teckenförklaring och ställ-lista: varje möbeltyp på ritningen med symbol, storlek, ägare (FCC eller leverantören) och antal.
 * Stolar räknas samman, både lösa och de som står runt borden.
 */
export function LayoutLegend({ items, types, showStock = false, compact = false }: { items: LayoutItem[]; types: LegendType[]; showStock?: boolean; compact?: boolean }) {
  const { per, chairs } = countItems(items);
  const byId = new Map(types.map((t) => [t.id, t]));
  const shapeOf = (id: string) => byId.get(id)?.shape ?? items.find((i) => i.t === id)?.shape ?? "rect";
  // Typiskt antal stolar runt borden av typen, för symbolen.
  const chairsOf = (id: string) => {
    const xs = items.filter((i) => i.t === id && (i.chairs ?? 0) > 0).map((i) => i.chairs!);
    return xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : 0;
  };
  const rows = [...per]
    .filter(([id]) => shapeOf(id) !== "fixed")
    .sort((a, b) => (byId.get(a[0])?.sort_order ?? 99) - (byId.get(b[0])?.sort_order ?? 99));
  const stol = byId.get("stol");
  const sub = (t: LegendType | undefined, fallbackShape: Shape) => {
    if (!t) return null;
    const size = t.width_m != null && t.depth_m != null ? sizeText({ shape: t.shape ?? fallbackShape, width_m: t.width_m, depth_m: t.depth_m }) : null;
    const owner = t.supplier !== undefined ? ownerText(t) : null;
    return [size, owner].filter(Boolean).join(" · ") || null;
  };
  const over = (n: number, t?: LegendType) => showStock && t?.stock != null && !t.supplier && n > t.stock;

  return (
    <table className={`w-full ${compact ? "text-xs" : "text-sm"}`}>
      <tbody>
        {rows.map(([id, n]) => {
          const t = byId.get(id);
          const shape = shapeOf(id);
          const s = sub(t, shape);
          return (
            <tr key={id} className="border-b border-line/60 align-middle">
              <td className="py-1 pr-2 w-8"><LegendSymbol shape={shape} color={t?.color} chairs={chairsOf(id)} size={compact ? 22 : 28} /></td>
              <td className="py-1">
                <span className="font-medium">{t?.name ?? id}</span>
                {s && <span className="block text-xs text-muted">{s}</span>}
              </td>
              <td className={`py-1 pl-2 text-right tabular-nums font-semibold ${over(n, t) ? "text-warn" : ""}`}>{n}</td>
              {showStock && <td className={`py-1 pl-1 text-right text-xs tabular-nums w-14 ${over(n, t) ? "text-warn" : "text-muted"}`}>{t?.stock != null && !t.supplier ? `av ${t.stock}` : t?.supplier ? "hyrs" : ""}</td>}
            </tr>
          );
        })}
        <tr className="align-middle">
          <td className="py-1 pr-2 w-8"><LegendSymbol shape="chair" size={compact ? 22 : 28} /></td>
          <td className="py-1">
            <span className="font-semibold">Stolar totalt</span>
            <span className="block text-xs text-muted">{["lösa och runt borden", stol ? sub(stol, "chair")?.split(" · ").pop() : null].filter(Boolean).join(" · ")}</span>
          </td>
          <td className={`py-1 pl-2 text-right tabular-nums font-semibold ${over(chairs, stol) ? "text-warn" : ""}`}>{chairs}</td>
          {showStock && <td className={`py-1 pl-1 text-right text-xs tabular-nums w-14 ${over(chairs, stol) ? "text-warn" : "text-muted"}`}>{stol?.stock != null ? `av ${stol.stock}` : ""}</td>}
        </tr>
      </tbody>
    </table>
  );
}

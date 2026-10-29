import Link from "next/link";

export type SortState = { col: string; asc: boolean };

/** Läser ?sort=kolumn&ordning=fallande från adressen. */
export function parseSort(sp: { sort?: string; ordning?: string }, allowed: string[], fallback: SortState): SortState {
  return allowed.includes(sp.sort ?? "") ? { col: sp.sort!, asc: sp.ordning !== "fallande" } : fallback;
}

/** Sorterar en lista i minnet efter en vald kolumn (svensk ordning, tomma sist). */
export function sortRows<T>(rows: T[], sort: SortState, get: Record<string, (r: T) => string | number | null | undefined>) {
  const f = get[sort.col];
  if (!f) return rows;
  const coll = new Intl.Collator("sv", { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    const x = f(a), y = f(b);
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : coll.compare(String(x), String(y));
    return sort.asc ? c : -c;
  });
}

/** Kolumnrubrik som går att klicka på för att sortera. */
export function SortTh({ col, label, sort, href, className }: { col: string; label: string; sort: SortState; href: (q: string) => string; className?: string }) {
  const active = sort.col === col;
  const next = active && sort.asc ? `sort=${col}&ordning=fallande` : `sort=${col}`;
  return (
    <th className={className} aria-sort={active ? (sort.asc ? "ascending" : "descending") : undefined}>
      <Link href={href(next)} className={`inline-flex items-center gap-1 hover:text-fg ${active ? "text-fg" : ""}`}>
        {label}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-30"}`}>{active ? (sort.asc ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
}

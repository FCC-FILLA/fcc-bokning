import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { runEnd, type RunSheetItem } from "@/lib/korschema";

/** Körschemat som lista per dag (för kund, personal och utskrift). Personalens egna punkter markeras. */
export function RunSheetView({ items, mine, compact }: { items: RunSheetItem[]; mine?: string | null; compact?: boolean }) {
  if (!items.length) return null;
  const days = new Map<string, RunSheetItem[]>();
  for (const x of items) days.set(isoToDate(x.starts_at), [...(days.get(isoToDate(x.starts_at)) ?? []), x]);
  return (
    <div className="grid gap-3">
      {[...days].map(([d, list]) => (
        <div key={d} className="grid gap-1">
          {days.size > 1 && <p className="capitalize text-muted text-sm">{fmtDate(d)}</p>}
          <ol className="grid">
            {list.map((x) => {
              const end = runEnd(x);
              const own = !!mine && (x.function_id === mine || x.function === mine);
              return (
                <li
                  key={x.id}
                  className={`grid grid-cols-[5.5rem_1fr] gap-x-3 border-l-[3px] py-1 pl-2 ${own ? "bg-brand-soft/50" : ""} ${compact ? "text-sm" : ""}`}
                  style={{ borderLeftColor: x.color ?? "var(--color-line)" }}
                >
                  <span className="font-mono tabular-nums">{fmtTime(x.starts_at)}{end ? `–${fmtTime(end)}` : ""}</span>
                  <span>
                    <span className="font-semibold">{x.title}</span>
                    {(x.room || x.who || x.function) && (
                      <span className="text-muted"> · {[x.room, x.who, x.function].filter(Boolean).join(" · ")}</span>
                    )}
                    {own && <span className="ml-1 rounded bg-brand px-1 text-[10px] font-semibold text-white align-middle">DIN</span>}
                    {x.note && <span className="block text-sm text-muted whitespace-pre-line">{x.note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

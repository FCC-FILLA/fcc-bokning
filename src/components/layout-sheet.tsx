import { LayoutDrawing } from "@/components/layout-drawing";
import { countItems, type FurnitureType, type LayoutItem, type RoomPlan } from "@/lib/moblering";

/** Ritningen med ställ-lista och instruktioner. Används för utskrift och på personalens pass. */
export function LayoutSheet({
  plan, items, types, notes, compact = false,
}: { plan: RoomPlan; items: LayoutItem[]; types: Pick<FurnitureType, "id" | "name" | "color" | "sort_order">[]; notes?: string | null; compact?: boolean }) {
  const { per, chairs } = countItems(items);
  const byId = new Map(types.map((t) => [t.id, t]));
  const rows = [...per].sort((a, b) => (byId.get(a[0])?.sort_order ?? 99) - (byId.get(b[0])?.sort_order ?? 99));
  return (
    <div className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-[minmax(0,1fr)_240px] print:grid-cols-[minmax(0,1fr)_200px] items-start"}>
      <div className="rounded-lg border border-line overflow-hidden">
        <LayoutDrawing
          plan={plan}
          items={items}
          colors={Object.fromEntries(types.map((t) => [t.id, t.color]))}
          names={Object.fromEntries(types.map((t) => [t.id, t.name]))}
          className="block"
        />
      </div>
      <div className="grid gap-3 text-sm">
        <div>
          <p className="font-semibold">Ställ-lista</p>
          <table className="w-full">
            <tbody>
              {rows.map(([t, n]) => (
                <tr key={t} className="border-b border-line/60"><td className="py-0.5">{byId.get(t)?.name ?? t}</td><td className="text-right tabular-nums font-semibold">{n}</td></tr>
              ))}
              <tr><td className="py-0.5 font-semibold">Stolar</td><td className="text-right tabular-nums font-semibold">{chairs}</td></tr>
            </tbody>
          </table>
        </div>
        {notes?.trim() && (
          <div>
            <p className="font-semibold">Instruktioner</p>
            <p className="whitespace-pre-line">{notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

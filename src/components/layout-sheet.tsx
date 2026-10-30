import { LayoutDrawing } from "@/components/layout-drawing";
import { LayoutLegend, type LegendType } from "@/components/layout-legend";
import { closedWalls, focusView, type LayoutItem, type RoomPlan } from "@/lib/moblering";

/** Ritningen med ställ-lista och instruktioner. Används för utskrift och på personalens pass. */
export function LayoutSheet({
  plan, items, types, notes, compact = false, walls,
}: { walls?: string[] | null; plan: RoomPlan; items: LayoutItem[]; types: LegendType[]; notes?: string | null; compact?: boolean }) {
  return (
    <div className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] print:grid-cols-[minmax(0,1fr)_62mm] items-start"}>
      <div className="rounded-lg border border-line overflow-hidden">
        <LayoutDrawing
          plan={plan}
          items={items}
          view={focusView(plan, items)}
          closed={closedWalls(plan, walls)}
          colors={Object.fromEntries(types.map((t) => [t.id, t.color]))}
          names={Object.fromEntries(types.map((t) => [t.id, t.name]))}
          className="block"
        />
      </div>
      <div className="grid gap-3 text-sm">
        <div>
          <p className="font-semibold">Ställ-lista och teckenförklaring</p>
          <LayoutLegend items={items} types={types} compact={compact} />
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

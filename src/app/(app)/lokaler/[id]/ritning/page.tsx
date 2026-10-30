import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { planFor } from "@/lib/moblering";
import { loadFurniture } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LayoutEditor } from "@/components/layout-editor";
import { saveRoomPlan } from "../../../mobleringar/actions";

export default async function RoomPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [{ data: room }, types] = await Promise.all([
    supabase.from("rooms").select("id, name, kvm, plan").eq("id", id).maybeSingle(),
    loadFurniture(supabase),
  ]);
  if (!room) notFound();
  const r = room as { id: string; name: string; kvm: number | null; plan: unknown };
  const plan = planFor(r.plan, r.kvm);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href={`/lokaler/${id}`} className="text-sm text-muted hover:underline">← {r.name}</Link>
        <h1 className="text-2xl font-semibold">Grundritning: {r.name}</h1>
        <p className="text-sm text-muted max-w-3xl">
          Ange lokalens mått och lägg ut det som inte går att flytta: pelare, dörrar, nödutgångar och fast scen. Allt detta syns sedan låst i varje
          möbleringsritning för lokalen. Fronten (där scenen brukar stå) ritas upptill.
          {!r.plan && " Måtten nedan är en gissning utifrån kvm – justera dem."}
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Grundritningen är sparad.</p>}
      <LayoutEditor
        key={JSON.stringify(r.plan ?? null)}
        mode="room"
        plan={plan}
        initial={plan.items}
        types={types}
        action={saveRoomPlan.bind(null, id)}
        readOnly={!admin}
        kvm={r.kvm}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { parseItems, planFor } from "@/lib/moblering";
import { loadFurniture, type LayoutRow } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LayoutSheet } from "@/components/layout-sheet";
import { PrintButton } from "@/components/print-button";

export default async function LayoutPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("layouts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const l = data as LayoutRow;
  const [{ data: room }, { data: setup }, { data: ev }, { data: booking }, types] = await Promise.all([
    supabase.from("rooms").select("name, kvm, plan").eq("id", l.room_id).single(),
    l.setup_id ? supabase.from("setups").select("name").eq("id", l.setup_id).single() : Promise.resolve({ data: null }),
    l.event_id ? supabase.from("events").select("title, participants").eq("id", l.event_id).single() : Promise.resolve({ data: null }),
    l.booking_id ? supabase.from("bookings").select("starts_at, ends_at").eq("id", l.booking_id).single() : Promise.resolve({ data: null }),
    loadFurniture(supabase),
  ]);
  const r = room as { name: string; kvm: number | null; plan: unknown };
  const e = ev as { title: string; participants: number | null } | null;
  const b = booking as { starts_at: string; ends_at: string } | null;

  return (
    <div className="grid gap-4 max-w-6xl print:max-w-none">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/mobleringar/${id}`} className="text-sm text-muted hover:underline">← Tillbaka till ritningen</Link>
        <span className="flex-1" />
        <PrintButton label="Skriv ut / spara som PDF" />
      </div>
      <header className="grid gap-0.5">
        <h1 className="text-2xl font-semibold">{e ? e.title : l.name}</h1>
        <p className="text-muted">
          {r.name}
          {e && ` · ${l.name}`}
          {setup && ` · ${(setup as { name: string }).name}`}
          {b && ` · ${fmtDate(b.starts_at)} ${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)}`}
          {e?.participants ? ` · ${e.participants} gäster` : ""}
        </p>
      </header>
      <LayoutSheet plan={planFor(r.plan, r.kvm)} items={parseItems(l.items)} types={types} notes={l.notes} walls={l.walls} />
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
    </div>
  );
}

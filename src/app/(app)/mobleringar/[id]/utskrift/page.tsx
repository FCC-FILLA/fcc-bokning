import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { TZ, fmtDate, fmtTime } from "@/lib/datum";
import { parseItems, planFor } from "@/lib/moblering";
import { loadFurniture, type LayoutRow } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LayoutSheet } from "@/components/layout-sheet";
import { PrintButton } from "@/components/print-button";

const stamp = (d: Date | string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export default async function LayoutPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("layouts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const l = data as LayoutRow;
  const [{ data: room }, { data: setup }, { data: ev }, { data: booking }, types] = await Promise.all([
    supabase.from("rooms").select("name, kvm, plan").eq("id", l.room_id).single(),
    l.setup_id ? supabase.from("setups").select("name").eq("id", l.setup_id).single() : Promise.resolve({ data: null }),
    l.event_id
      ? supabase.from("events").select("title, participants, companies(name), responsible:profiles!events_responsible_id_fkey(full_name)").eq("id", l.event_id).single()
      : Promise.resolve({ data: null }),
    l.booking_id ? supabase.from("bookings").select("starts_at, ends_at, rig_minutes").eq("id", l.booking_id).single() : Promise.resolve({ data: null }),
    loadFurniture(supabase),
  ]);
  const r = room as { name: string; kvm: number | null; plan: unknown };
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const e = ev as { title: string; participants: number | null; companies: { name: string } | { name: string }[] | null; responsible: { full_name: string } | { full_name: string }[] | null } | null;
  const b = booking as { starts_at: string; ends_at: string; rig_minutes: number | null } | null;
  const rigFrom = b?.rig_minutes ? new Date(new Date(b.starts_at).getTime() - b.rig_minutes * 60000).toISOString() : null;
  const company = one(e?.companies)?.name;
  const responsible = one(e?.responsible)?.full_name;
  const printed = stamp(new Date());

  const meta: [string, string | null | undefined][] = [
    ["Evenemang", e?.title ?? "Mall (inget evenemang)"],
    ["Kund", company],
    ["Lokal", r.name],
    ["Datum", b ? `${fmtDate(b.starts_at)} ${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)}` : null],
    ["Ställ från", rigFrom ? `${fmtDate(rigFrom)} ${fmtTime(rigFrom)}` : null],
    ["Möblering", (setup as { name: string } | null)?.name],
    ["Gäster", e?.participants ? String(e.participants) : null],
    ["Ansvarig", responsible],
  ];

  return (
    <div className="grid gap-4 max-w-6xl print:max-w-none print:gap-3">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/mobleringar/${id}`} className="text-sm text-muted hover:underline">← Tillbaka till ritningen</Link>
        <span className="flex-1" />
        <p className="text-sm text-muted">Välj Liggande och Spara som PDF i utskriftsrutan.</p>
        <PrintButton label="Skriv ut / spara som PDF" />
      </div>

      <header className="flex items-start gap-6 border-b-2 border-brand pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fcc-logo-black.svg" alt="Filadelfia Convention Center" width={170} height={43} className="h-11 w-auto shrink-0" />
        <div className="grid gap-1 min-w-0 flex-1">
          <h1 className="text-xl font-semibold leading-tight">{l.name}</h1>
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-0.5 text-sm">
            {meta.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt>
                <dd className="font-medium truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="shrink-0 rounded-md border border-line px-3 py-1.5 text-right text-xs leading-relaxed">
          <p className="text-base font-semibold">Version {l.version ?? 1}</p>
          <p className="text-muted">Ändrad {stamp(l.updated_at)}</p>
          <p className="text-muted">Utskriven {printed}</p>
        </div>
      </header>

      <LayoutSheet plan={planFor(r.plan, r.kvm)} items={parseItems(l.items)} types={types} notes={l.notes} walls={l.walls} />

      <footer className="flex gap-4 border-t border-line pt-2 text-[10px] text-muted print:fixed print:bottom-0 print:left-0 print:right-0 print:bg-white">
        <span>Filadelfia Convention Center</span>
        <span>{e ? `${e.title} · ` : ""}{r.name} · {l.name}</span>
        <span className="flex-1" />
        <span>Version {l.version ?? 1} · utskriven {printed} av {me.full_name}</span>
      </footer>
      <style>{"@page { size: A4 landscape; margin: 10mm 10mm 14mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }"}</style>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { fmtDate, isoToDate } from "@/lib/datum";
import type { RunSheetItem } from "@/lib/korschema";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { RunSheetView } from "@/components/run-sheet-view";

export const metadata = { title: "Körschema" };

/** Utskrift av körschemat. ?for=kund visar bara det kunden ser. */
export default async function RunSheetPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ for?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();
  const [{ data: ev }, { data: it }] = await Promise.all([
    supabase.from("events").select("title, participants, companies(name)").eq("id", id).maybeSingle(),
    supabase.from("run_sheet_items").select("*, rooms(name), staff_functions(name, color)").eq("event_id", id).order("starts_at"),
  ]);
  if (!ev) notFound();
  type Raw = { id: string; starts_at: string; duration_minutes: number | null; title: string; who: string | null; note: string | null; function_id: string | null; customer_visible: boolean; staff_visible: boolean; rooms: { name: string } | null; staff_functions: { name: string; color: string } | null };
  const forCustomer = sp.for === "kund";
  const items: RunSheetItem[] = ((it ?? []) as unknown as Raw[])
    .filter((x) => !forCustomer || x.customer_visible)
    .map((x) => ({ id: x.id, starts_at: x.starts_at, duration_minutes: x.duration_minutes, title: x.title, who: x.who, note: x.note, room: x.rooms?.name ?? null,
      function_id: forCustomer ? null : x.function_id, function: forCustomer ? null : x.staff_functions?.name ?? null, color: forCustomer ? null : x.staff_functions?.color ?? null }));
  const e = ev as unknown as { title: string; participants: number | null; companies: { name: string } | null };
  return (
    <div className="mx-auto grid max-w-3xl gap-4 bg-white p-6 print:p-0">
      <div className="flex items-start gap-3">
        <div className="grow">
          <p className="label">Körschema{forCustomer ? "" : " · internt"}</p>
          <h1 className="text-2xl font-semibold">{e.title}</h1>
          <p className="text-sm text-muted">{[e.companies?.name, items[0] && fmtDate(isoToDate(items[0].starts_at)), e.participants && `${e.participants} gäster`].filter(Boolean).join(" · ")}</p>
        </div>
        <a className="btn btn-ghost print:hidden" href={forCustomer ? `?` : `?for=kund`}>{forCustomer ? "Visa allt" : "Bara kundens"}</a>
        <PrintButton />
      </div>
      {items.length ? <RunSheetView items={items} /> : <p className="text-muted">Inget körschema.</p>}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { addDays, dayStartIso, fmtDate, fmtTime, todayDate } from "@/lib/datum";
import { parseItems, planFor } from "@/lib/moblering";
import { loadFurniture, type LayoutRow } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { LayoutEditor } from "@/components/layout-editor";
import { copyLayout, deleteLayout, linkLayout, saveLayout, unlinkLayout } from "../actions";

export default async function LayoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparad?: string; mall?: string; kopierad?: string; kopplad?: string; bortkopplad?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("layouts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const l = data as LayoutRow;
  const [{ data: room }, { data: caps }, { data: setups }, { data: ev }, { data: booking }, types] = await Promise.all([
    supabase.from("rooms").select("id, name, kvm, plan").eq("id", l.room_id).single(),
    supabase.from("room_capacities").select("setup_id, capacity").eq("room_id", l.room_id),
    supabase.from("setups").select("id, name").order("sort_order"),
    l.event_id ? supabase.from("events").select("id, title, participants").eq("id", l.event_id).single() : Promise.resolve({ data: null }),
    l.booking_id ? supabase.from("bookings").select("starts_at, ends_at").eq("id", l.booking_id).single() : Promise.resolve({ data: null }),
    loadFurniture(supabase),
  ]);
  // Bokningar i samma lokal som ritningen kan kopplas till (senaste månaden och framåt).
  const since = dayStartIso(addDays(todayDate(), -31));
  const { data: cands } = editor
    ? await supabase
        .from("bookings")
        .select("id, starts_at, ends_at, event_id, events!inner(title, status)")
        .eq("room_id", l.room_id)
        .gte("ends_at", since)
        .not("events.status", "eq", "avbokad")
        .order("starts_at")
        .limit(200)
    : { data: [] };
  const bookingsToLink = ((cands ?? []) as unknown as { id: string; starts_at: string; ends_at: string; event_id: string; events: { title: string } | { title: string }[] }[])
    .map((c) => ({ ...c, title: (Array.isArray(c.events) ? c.events[0] : c.events)?.title ?? "" }))
    .filter((c) => c.id !== l.booking_id);
  const r = room as { id: string; name: string; kvm: number | null; plan: unknown } | null;
  if (!r) notFound();
  const e = ev as { id: string; title: string; participants: number | null } | null;
  const b = booking as { starts_at: string; ends_at: string } | null;
  const capacities = Object.fromEntries(((caps ?? []) as { setup_id: string; capacity: number }[]).map((c) => [c.setup_id, c.capacity]));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          {e ? (
            <Link href={`/evenemang/${e.id}#genomforande`} className="text-sm text-muted hover:underline">← {e.title}</Link>
          ) : (
            <Link href="/mobleringar" className="text-sm text-muted hover:underline">← Möbleringar</Link>
          )}
          <h1 className="text-2xl font-semibold">{l.name}</h1>
          <p className="text-sm text-muted">
            {r.name}
            {b && <> · {fmtDate(b.starts_at)} {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</>}
            {!e && " · mall"}
            {r.plan == null && <> · Lokalen saknar grundritning, så måtten är uppskattade från kvm. <Link className="underline" href={`/lokaler/${r.id}/ritning`}>Rita lokalen</Link></>}
          </p>
        </div>
        <span className="flex-1" />
        <Link className="btn" href={`/mobleringar/${id}/utskrift`}>Skriv ut / PDF</Link>
        {editor && (
          <>
            {e && <form action={copyLayout.bind(null, id, true)}><button className="btn btn-ghost" type="submit">Spara som mall</button></form>}
            <form action={copyLayout.bind(null, id, false)}><button className="btn btn-ghost" type="submit">Kopiera</button></form>
            <form action={deleteLayout.bind(null, id)}>
              <ConfirmButton label="Ta bort" question="Ritningen tas bort." confirmLabel="Ta bort" className="btn btn-ghost text-warn" />
            </form>
          </>
        )}
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Ritningen är sparad.</p>}
      {sp.mall && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Mallen är skapad. Den finns under Möbleringar och kan väljas när ni ritar nästa evenemang i {r.name}.</p>}
      {sp.kopierad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Kopian är skapad.</p>}
      {sp.kopplad && e && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Ritningen är kopplad till {e.title}. Den syns under Genomförande på evenemanget.</p>}
      {sp.bortkopplad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Kopplingen är borttagen. Ritningen ligger nu som mall för {r.name}.</p>}

      {editor && (
        <details className="card p-3 text-sm" open={!e && bookingsToLink.length > 0 && !sp.sparad}>
          <summary className="cursor-pointer font-semibold">{e ? `Kopplad till ${e.title}` : "Koppla till ett evenemang"}</summary>
          <div className="mt-2 grid gap-2">
            {bookingsToLink.length ? (
              <form action={linkLayout.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <div className="field min-w-72 flex-1">
                  <label className="label" htmlFor="link-b">{e ? "Flytta till en annan bokning" : "Bokning i " + r.name}</label>
                  <select className="input" id="link-b" name="booking_id" required defaultValue="">
                    <option value="" disabled>Välj evenemang och tid</option>
                    {bookingsToLink.map((c) => (
                      <option key={c.id} value={c.id}>{fmtDate(c.starts_at)} {fmtTime(c.starts_at)}–{fmtTime(c.ends_at)} · {c.title}</option>
                    ))}
                  </select>
                </div>
                {!e && <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" name="copy" defaultChecked /> Behåll mallen (koppla en kopia)</label>}
                <button className="btn btn-primary" type="submit">Koppla</button>
              </form>
            ) : (
              <p className="text-muted">Det finns inga kommande bokningar i {r.name} att koppla till. Boka lokalen på evenemanget först.</p>
            )}
            {e && (
              <form action={unlinkLayout.bind(null, id)}>
                <button className="btn btn-ghost px-2 text-sm" type="submit">Koppla bort från evenemanget (blir en mall)</button>
              </form>
            )}
          </div>
        </details>
      )}

      <LayoutEditor
        key={l.updated_at}
        mode="layout"
        plan={planFor(r.plan, r.kvm)}
        initial={parseItems(l.items)}
        types={types}
        action={saveLayout.bind(null, id)}
        readOnly={!editor}
        capacities={capacities}
        setups={(setups ?? []) as { id: string; name: string }[]}
        fields={{ name: l.name, setup_id: l.setup_id, notes: l.notes, staff_visible: l.staff_visible }}
        guests={e?.participants ?? null}
        walls={l.walls}
        kvm={r.kvm}
      />
    </div>
  );
}

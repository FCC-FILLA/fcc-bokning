import Link from "next/link";
import { canManageStaff, getProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { countItems, parseItems, planFor } from "@/lib/moblering";
import { loadFurniture } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LayoutDrawing } from "@/components/layout-drawing";
import { createLayout } from "@/app/(app)/mobleringar/actions";

type L = { id: string; name: string; room_id: string; booking_id: string | null; items: unknown; staff_visible: boolean; event_id: string | null };
type B = { id: string; room_id: string; starts_at: string; ends_at: string };
type R = { id: string; name: string; kvm: number | null; plan: unknown };

/** Evenemangets möbleringsritningar (flik Genomförande). */
export async function EventLayouts({ eventId }: { eventId: string }) {
  const editor = canManageStaff(await getProfile());
  const supabase = await createClient();
  const [{ data: l }, { data: t }, { data: b }, { data: r }, types] = await Promise.all([
    supabase.from("layouts").select("id, name, room_id, booking_id, items, staff_visible, event_id").eq("event_id", eventId).order("created_at"),
    supabase.from("layouts").select("id, name, room_id, booking_id, items, staff_visible, event_id").is("event_id", null).order("name"),
    supabase.from("bookings").select("id, room_id, starts_at, ends_at").eq("event_id", eventId).order("starts_at"),
    supabase.from("rooms").select("id, name, kvm, plan"),
    loadFurniture(supabase),
  ]);
  const layouts = (l ?? []) as L[];
  const templates = (t ?? []) as L[];
  const bookings = (b ?? []) as B[];
  const rooms = new Map(((r ?? []) as R[]).map((x) => [x.id, x]));
  const bookingById = new Map(bookings.map((x) => [x.id, x]));
  const colors = Object.fromEntries(types.map((x) => [x.id, x.color]));
  const bookedRooms = new Set(bookings.map((x) => x.room_id));
  const relevant = templates.filter((x) => bookedRooms.has(x.room_id));

  return (
    <section id="moblering" className="card p-5 grid gap-4 scroll-mt-28">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Möblering</h2>
        <span className="text-sm text-muted">Ritningar och ställ-listor. De som är markerade för personal syns på deras pass.</span>
      </div>
      {layouts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {layouts.map((x) => {
            const room = rooms.get(x.room_id);
            const bk = x.booking_id ? bookingById.get(x.booking_id) : null;
            const items = parseItems(x.items);
            return (
              <div key={x.id} className="rounded-lg border border-line overflow-hidden grid">
                <Link href={`/mobleringar/${x.id}`} className="bg-white border-b border-line">
                  <LayoutDrawing plan={planFor(room?.plan, room?.kvm ?? null)} items={items} colors={colors} numbers={false} grid={false} className="block" />
                </Link>
                <div className="p-3 flex flex-wrap items-center gap-2">
                  <span className="grid flex-1 min-w-40">
                    <Link className="font-semibold hover:underline" href={`/mobleringar/${x.id}`}>{x.name}</Link>
                    <span className="text-xs text-muted">
                      {room?.name}{bk ? ` · ${fmtDate(bk.starts_at)} ${fmtTime(bk.starts_at)}` : ""} · {countItems(items).chairs} platser{x.staff_visible ? "" : " · dold för personal"}
                    </span>
                  </span>
                  <Link className="btn btn-ghost text-sm" href={`/mobleringar/${x.id}/utskrift`}>Skriv ut</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editor && bookings.length > 0 && (
        <form action={createLayout} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="field"><label className="label" htmlFor="ml-booking">Lokal och tid</label>
            <select className="input" id="ml-booking" name="booking_id" required>
              {bookings.map((x) => (
                <option key={x.id} value={x.id}>{rooms.get(x.room_id)?.name} · {fmtDate(x.starts_at)} {fmtTime(x.starts_at)}–{fmtTime(x.ends_at)}</option>
              ))}
            </select></div>
          <div className="field"><label className="label" htmlFor="ml-from">Utgå från</label>
            <select className="input" id="ml-from" name="from" defaultValue="">
              <option value="">Tom ritning</option>
              {relevant.length > 0 && (
                <optgroup label="Mallar för lokalerna">
                  {relevant.map((x) => <option key={x.id} value={x.id}>{x.name} ({rooms.get(x.room_id)?.name})</option>)}
                </optgroup>
              )}
              {layouts.length > 0 && (
                <optgroup label="Kopiera från detta evenemang">
                  {layouts.map((x) => <option key={x.id} value={x.id}>{x.name} ({rooms.get(x.room_id)?.name})</option>)}
                </optgroup>
              )}
            </select></div>
          <div className="field grow min-w-48"><label className="label" htmlFor="ml-name">Namn</label>
            <input className="input" id="ml-name" name="name" placeholder="T.ex. Middag, Konferens dag 1" /></div>
          <button className="btn" type="submit">Rita möblering</button>
        </form>
      )}
      {editor && bookings.length === 0 && <p className="text-sm text-muted">Lägg till en lokalbokning under Program och lokaler först.</p>}
    </section>
  );
}

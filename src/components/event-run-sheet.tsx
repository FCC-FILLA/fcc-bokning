import Link from "next/link";
import { canManageStaff, getProfile } from "@/lib/auth";
import { fmtTime, isoToDate, isoToLocal } from "@/lib/datum";
import { runEnd } from "@/lib/korschema";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { addRunItem, copyRunSheet, deleteRunItem, shiftRunItems, updateRunItem } from "@/app/(app)/evenemang/korschema-actions";

type Item = {
  id: string; starts_at: string; duration_minutes: number | null; title: string; room_id: string | null; who: string | null;
  function_id: string | null; note: string | null; customer_visible: boolean; staff_visible: boolean;
};
type Opt = { id: string; name: string };

/** Körschema på evenemanget (flik Genomförande): punkter minut för minut, synliga för kund och/eller personal. */
export async function EventRunSheet({ eventId, error }: { eventId: string; error?: string }) {
  const editor = canManageStaff(await getProfile());
  const supabase = await createClient();
  const [{ data: it }, { data: bk }, { data: rm }, { data: fn }, { data: others }] = await Promise.all([
    supabase.from("run_sheet_items").select("*").eq("event_id", eventId).order("starts_at"),
    supabase.from("bookings").select("starts_at, room_id").eq("event_id", eventId).order("starts_at"),
    supabase.from("rooms").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("staff_functions").select("id, name, color").eq("active", true).order("sort_order"),
    supabase.from("run_sheet_items").select("event_id, events(title)").neq("event_id", eventId).order("created_at", { ascending: false }).limit(200),
  ]);
  const items = (it ?? []) as Item[];
  const bookings = (bk ?? []) as { starts_at: string; room_id: string }[];
  const rooms = (rm ?? []) as Opt[];
  const fns = (fn ?? []) as (Opt & { color: string })[];
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const fnBy = new Map(fns.map((f) => [f.id, f]));
  const bookedRooms = new Set(bookings.map((b) => b.room_id));
  const roomOpts = [...rooms.filter((r) => bookedRooms.has(r.id)), ...rooms.filter((r) => !bookedRooms.has(r.id))];
  const sources = [...new Map(((others ?? []) as unknown as { event_id: string; events: { title: string } | null }[]).map((x) => [x.event_id, x.events?.title ?? "Evenemang"])).entries()].slice(0, 40);
  const firstDay = bookings[0] ? isoToDate(bookings[0].starts_at) : "";
  const lastAt = items.at(-1) ? runEnd(items.at(-1)!) ?? items.at(-1)!.starts_at : null;
  const nextTime = lastAt ? isoToLocal(lastAt).slice(11, 16) : "08:00";
  const nextDate = lastAt ? isoToDate(lastAt) : firstDay;

  const fields = (x?: Item, idp = "n") => (
    <>
      <div className="field w-36"><label className="label" htmlFor={`${idp}-date`}>Dag</label>
        <input className="input" id={`${idp}-date`} name="date" type="date" required defaultValue={x ? isoToDate(x.starts_at) : nextDate} /></div>
      <div className="field w-24"><label className="label" htmlFor={`${idp}-time`}>Tid</label>
        <input className="input" id={`${idp}-time`} name="time" type="time" step={300} required defaultValue={x ? isoToLocal(x.starts_at).slice(11, 16) : nextTime} /></div>
      <div className="field w-24"><label className="label" htmlFor={`${idp}-dur`}>Minuter</label>
        <input className="input" id={`${idp}-dur`} name="duration_minutes" type="number" min={0} max={2880} step={5} defaultValue={x?.duration_minutes ?? ""} /></div>
      <div className="field grow min-w-48"><label className="label" htmlFor={`${idp}-title`}>Vad</label>
        <input className="input" id={`${idp}-title`} name="title" required maxLength={200} defaultValue={x?.title ?? ""} placeholder="T.ex. Insläpp, Välkomsttal, Middag" /></div>
      <div className="field w-44"><label className="label" htmlFor={`${idp}-room`}>Lokal</label>
        <select className="input" id={`${idp}-room`} name="room_id" defaultValue={x?.room_id ?? ""}>
          <option value="">–</option>
          {roomOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></div>
      <div className="field w-44"><label className="label" htmlFor={`${idp}-who`}>Vem</label>
        <input className="input" id={`${idp}-who`} name="who" defaultValue={x?.who ?? ""} placeholder="Talare, ansvarig …" /></div>
      <div className="field w-44"><label className="label" htmlFor={`${idp}-fn`}>Personalfunktion</label>
        <select className="input" id={`${idp}-fn`} name="function_id" defaultValue={x?.function_id ?? ""}>
          <option value="">Alla</option>
          {fns.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select></div>
      <div className="field grow min-w-48"><label className="label" htmlFor={`${idp}-note`}>Notering</label>
        <input className="input" id={`${idp}-note`} name="note" defaultValue={x?.note ?? ""} /></div>
      <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="customer_visible" defaultChecked={x ? x.customer_visible : true} /> Kunden ser</label>
      <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="staff_visible" defaultChecked={x ? x.staff_visible : true} /> Personalen ser</label>
    </>
  );

  return (
    <section id="korschema" className="card p-5 grid gap-4 scroll-mt-28">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Körschema</h2>
        <span className="text-sm text-muted">Minut för minut. Syns på kundens eventlänk och på personalens pass, var för sig.</span>
        <span className="flex-1" />
        {items.length > 0 && <Link className="btn btn-ghost text-sm" href={`/evenemang/${eventId}/korschema`} target="_blank">Skriv ut</Link>}
      </div>
      {error && <p className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Inget körschema ännu.</p>
      ) : (
        <ol className="grid divide-y divide-line rounded-lg border border-line">
          {items.map((x, i) => {
            const end = runEnd(x);
            const f = x.function_id ? fnBy.get(x.function_id) : null;
            const newDay = i === 0 || isoToDate(items[i - 1].starts_at) !== isoToDate(x.starts_at);
            return (
              <li key={x.id} className="relative grid gap-1 px-3 py-2 text-sm" style={{ borderLeft: `3px solid ${f?.color ?? "transparent"}` }}>
                {newDay && <span className="label">{new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Stockholm" }).format(new Date(x.starts_at))}</span>}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono w-24 shrink-0">{fmtTime(x.starts_at)}{end ? `–${fmtTime(end)}` : ""}</span>
                  <span className="font-semibold">{x.title}</span>
                  <span className="text-muted">{[x.room_id && roomName.get(x.room_id), x.who, f?.name].filter(Boolean).join(" · ")}</span>
                  {x.note && <span className="text-muted">{x.note}</span>}
                  <span className="flex-1" />
                  <span className="text-xs text-muted">{x.customer_visible ? "kund" : ""}{x.customer_visible && x.staff_visible ? " · " : ""}{x.staff_visible ? "personal" : ""}{!x.customer_visible && !x.staff_visible ? "internt" : ""}</span>
                  {editor && (
                    <span className="flex items-center gap-1">
                      <details>
                        <summary className="btn btn-ghost px-2 text-sm list-none cursor-pointer">Ändra</summary>
                        <form action={updateRunItem.bind(null, eventId, x.id)} className="absolute left-2 right-2 z-10 mt-1 card p-4 flex flex-wrap items-end gap-3 shadow-lg">
                          {fields(x, `e${x.id.slice(0, 8)}`)}
                          <button className="btn btn-primary" type="submit">Spara</button>
                        </form>
                      </details>
                      <form action={deleteRunItem.bind(null, eventId, x.id)}>
                        <ConfirmButton label="✕" question="Ta bort punkten?" confirmLabel="Ja" className="btn btn-ghost px-2 text-sm text-warn" />
                      </form>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {editor && (
        <>
          <form action={addRunItem.bind(null, eventId)} className="flex flex-wrap items-end gap-3 rounded-lg bg-sunk/60 p-3">
            {fields()}
            <button className="btn btn-primary" type="submit">Lägg till</button>
          </form>
          <div className="flex flex-wrap gap-6 text-sm">
            {items.length > 0 && (
              <form action={shiftRunItems.bind(null, eventId)} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Flytta</span>
                <select className="input h-8 w-auto py-0" name="from_item" defaultValue="" aria-label="Från punkt">
                  <option value="">alla punkter</option>
                  {items.map((x) => <option key={x.id} value={x.id}>från {fmtTime(x.starts_at)} {x.title}</option>)}
                </select>
                <input className="input h-8 w-20 py-0" name="minutes" type="number" min={-1440} max={1440} step={5} defaultValue={15} aria-label="Minuter" />
                <span className="text-muted">minuter</span>
                <button className="btn" type="submit">Flytta</button>
              </form>
            )}
            {sources.length > 0 && (
              <form action={copyRunSheet.bind(null, eventId)} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Kopiera från</span>
                <select className="input h-8 w-56 py-0" name="source_event" required defaultValue="" aria-label="Evenemang att kopiera från">
                  <option value="" disabled>Välj evenemang</option>
                  {sources.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                </select>
                <span className="text-muted">till</span>
                <input className="input h-8 w-40 py-0" name="to_date" type="date" required defaultValue={firstDay} aria-label="Första dagen" />
                <button className="btn" type="submit">Kopiera</button>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}

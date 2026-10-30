import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteTask, saveTask, taskDone } from "../actions";

export const metadata = { title: "Tillsyn och underhåll" };

type Task = {
  id: string; title: string; room_id: string | null; location: string | null; interval_days: number; instructions: string | null;
  assignee_id: string | null; supplier_id: string | null; last_done_on: string | null; next_due_on: string; active: boolean;
  rooms: { name: string } | null; suppliers: { name: string; phone: string | null } | null;
};
type Log = { id: string; task_id: string; done_on: string; done_name: string | null; ok: boolean; note: string | null };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const every = (d: number) =>
  d === 1 ? "varje dag" : d === 7 ? "varje vecka" : d === 14 ? "varannan vecka" : d % 365 === 0 ? (d === 365 ? "varje år" : `vart ${d / 365}:e år`)
  : d % 30 === 0 ? (d === 30 ? "varje månad" : `var ${d / 30}:e månad`) : `var ${d}:e dag`;

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ fel?: string; klar?: string; visa?: string }> }) {
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const today = todayDate();
  const [{ data: t }, { data: logs }, { data: rooms }, { data: people }, { data: sups }] = await Promise.all([
    supabase.from("maintenance_tasks").select("*, rooms(name), suppliers(name, phone)").order("next_due_on"),
    supabase.from("maintenance_log").select("*").order("done_on", { ascending: false }).limit(500),
    supabase.from("rooms").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("active", true).in("role", ["admin", "bokare", "produktion"]).order("full_name"),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
  ]);
  const all = (t ?? []) as unknown as Task[];
  const tasks = all.filter((x) => (sp.visa === "alla" ? true : x.active));
  const byTask = new Map<string, Log[]>();
  for (const l of (logs ?? []) as Log[]) byTask.set(l.task_id, [...(byTask.get(l.task_id) ?? []), l]);
  const roomList = (rooms ?? []) as { id: string; name: string }[];
  const staff = (people ?? []) as { id: string; full_name: string | null }[];
  const suppliers = (sups ?? []) as { id: string; name: string }[];
  const late = tasks.filter((x) => x.active && x.next_due_on < today).length;
  const due = tasks.filter((x) => x.active && x.next_due_on === today).length;

  const fields = (x?: Task) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="field sm:col-span-2"><label className="label" htmlFor={`t-title-${x?.id ?? "ny"}`}>Vad ska göras</label>
        <input className="input" id={`t-title-${x?.id ?? "ny"}`} name="title" required defaultValue={x?.title} placeholder="T.ex. Kontroll av brandsläckare" /></div>
      <div className="field"><label className="label" htmlFor={`t-int-${x?.id ?? "ny"}`}>Hur ofta (dagar)</label>
        <select className="input" id={`t-int-${x?.id ?? "ny"}`} name="interval_days" defaultValue={x?.interval_days ?? 30}>
          {[[1, "Varje dag"], [7, "Varje vecka"], [14, "Varannan vecka"], [30, "Varje månad"], [90, "Varje kvartal"], [180, "Varje halvår"], [365, "Varje år"], [730, "Vartannat år"], [1095, "Vart tredje år"]]
            .concat(x && ![1, 7, 14, 30, 90, 180, 365, 730, 1095].includes(x.interval_days) ? [[x.interval_days, `Var ${x.interval_days}:e dag`]] : [])
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      <div className="field"><label className="label" htmlFor={`t-room-${x?.id ?? "ny"}`}>Lokal</label>
        <select className="input" id={`t-room-${x?.id ?? "ny"}`} name="room_id" defaultValue={x?.room_id ?? ""}>
          <option value="">Ingen särskild</option>
          {roomList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></div>
      <div className="field"><label className="label" htmlFor={`t-loc-${x?.id ?? "ny"}`}>Plats</label>
        <input className="input" id={`t-loc-${x?.id ?? "ny"}`} name="location" defaultValue={x?.location ?? ""} placeholder="T.ex. Fläktrum plan 3" /></div>
      <div className="field"><label className="label" htmlFor={`t-next-${x?.id ?? "ny"}`}>Nästa gång</label>
        <input className="input" id={`t-next-${x?.id ?? "ny"}`} name="next_due_on" type="date" defaultValue={x?.next_due_on ?? today} /></div>
      <div className="field"><label className="label" htmlFor={`t-who-${x?.id ?? "ny"}`}>Ansvarig</label>
        <select className="input" id={`t-who-${x?.id ?? "ny"}`} name="assignee_id" defaultValue={x?.assignee_id ?? ""}>
          <option value="">Den som får felanmälningar</option>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></div>
      <div className="field"><label className="label" htmlFor={`t-sup-${x?.id ?? "ny"}`}>Leverantör</label>
        <select className="input" id={`t-sup-${x?.id ?? "ny"}`} name="supplier_id" defaultValue={x?.supplier_id ?? ""}>
          <option value="">Görs av oss</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
      {x && (
        <div className="field"><label className="label" htmlFor={`t-act-${x.id}`}>Status</label>
          <select className="input" id={`t-act-${x.id}`} name="active" defaultValue={x.active ? "on" : "off"}>
            <option value="on">Aktiv</option><option value="off">Vilande</option>
          </select></div>
      )}
      <div className="field sm:col-span-3"><label className="label" htmlFor={`t-ins-${x?.id ?? "ny"}`}>Instruktion</label>
        <textarea className="input min-h-16" id={`t-ins-${x?.id ?? "ny"}`} name="instructions" defaultValue={x?.instructions ?? ""} placeholder="Vad som ska kontrolleras och vad man gör vid avvikelse" /></div>
    </div>
  );

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid gap-1 grow">
          <h1 className="text-2xl font-semibold">Tillsyn och underhåll</h1>
          <p className="text-sm text-muted">
            Återkommande kontroller med logg, bra vid brandskyddskontroll och försäkring. Ansvarig får en notis när det är dags.
            {late > 0 && <span className="text-warn font-semibold"> {late} försenad{late === 1 ? "" : "e"}.</span>}
            {due > 0 && <span className="font-semibold"> {due} att göra i dag.</span>}
          </p>
        </div>
        <a className="btn btn-ghost" href={sp.visa === "alla" ? "/fastighet/underhall" : "/fastighet/underhall?visa=alla"}>{sp.visa === "alla" ? "Bara aktiva" : "Visa även vilande"}</a>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.klar && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Utfört och loggat. Nästa datum är uträknat.</p>}

      <ul className="grid gap-3">
        {tasks.map((x) => {
          const d = daysBetween(today, x.next_due_on);
          const tone = !x.active ? "text-muted" : d < 0 ? "text-warn font-semibold" : d === 0 ? "font-semibold" : d <= 7 ? "" : "text-muted";
          const hist = byTask.get(x.id) ?? [];
          return (
            <li key={x.id} id={x.id} className={`card p-4 grid gap-2 scroll-mt-24 ${!x.active ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid gap-0.5 grow min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted">
                    {[x.rooms?.name, x.location, every(x.interval_days), x.suppliers ? `${x.suppliers.name}${x.suppliers.phone ? ` (${x.suppliers.phone})` : ""}` : null,
                      staff.find((p) => p.id === x.assignee_id)?.full_name].filter(Boolean).join(" · ")}
                  </p>
                  {x.instructions && <p className="text-sm whitespace-pre-line">{x.instructions}</p>}
                </div>
                <div className="text-right text-sm">
                  <p className={tone}>{!x.active ? "Vilande" : d < 0 ? `Försenad ${-d} dag${d === -1 ? "" : "ar"}` : d === 0 ? "I dag" : d === 1 ? "I morgon" : `Om ${d} dagar`}</p>
                  <p className="text-xs text-muted">{fmtDate(x.next_due_on)}{x.last_done_on ? ` · senast ${fmtDate(x.last_done_on)}` : ""}</p>
                </div>
              </div>
              {editor && x.active && (
                <form action={taskDone.bind(null, x.id)} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
                  <input className="input h-8 w-36 py-0 text-sm" name="done_on" type="date" defaultValue={today} aria-label="Utfört datum" />
                  <select className="input h-8 w-36 py-0 text-sm" name="ok" defaultValue="ok" aria-label="Resultat">
                    <option value="ok">Utan anmärkning</option><option value="avvikelse">Avvikelse</option>
                  </select>
                  <input className="input h-8 grow min-w-40 py-0 text-sm" name="note" placeholder="Kommentar (t.ex. vad som byttes)" aria-label="Kommentar" />
                  <button className="btn btn-primary text-sm" type="submit">Utfört</button>
                </form>
              )}
              {(hist.length > 0 || editor) && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">{hist.length ? `Logg (${hist.length})` : "Ändra"}{hist.length && editor ? " och ändra" : ""}</summary>
                  {hist.length > 0 && (
                    <ul className="mt-2 grid gap-1">
                      {hist.slice(0, 12).map((l) => (
                        <li key={l.id} className="flex gap-2">
                          <span className="tabular-nums w-24 shrink-0">{fmtDate(l.done_on)}</span>
                          <span className={l.ok ? "text-ok" : "text-warn font-semibold"}>{l.ok ? "OK" : "Avvikelse"}</span>
                          <span className="text-muted">{[l.done_name, l.note].filter(Boolean).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {editor && (
                    <div className="mt-3 grid gap-2">
                      <form action={saveTask.bind(null, x.id)} className="grid gap-3">
                        {fields(x)}
                        <div><button className="btn" type="submit">Spara ändringar</button></div>
                      </form>
                      <form action={deleteTask.bind(null, x.id)}>
                        <ConfirmButton label="Ta bort" question="Uppgiften och hela loggen tas bort. Vill du hellre göra den vilande?" confirmLabel="Ta bort" className="btn btn-ghost text-warn text-sm" />
                      </form>
                    </div>
                  )}
                </details>
              )}
            </li>
          );
        })}
        {tasks.length === 0 && <li className="card p-8 text-center text-muted">Inga uppgifter än.</li>}
      </ul>

      {editor && (
        <details className="card p-4" open={tasks.length === 0}>
          <summary className="cursor-pointer font-semibold">Ny återkommande uppgift</summary>
          <form action={saveTask.bind(null, null)} className="mt-3 grid gap-3">
            {fields()}
            <div><button className="btn btn-primary" type="submit">Lägg till</button></div>
          </form>
        </details>
      )}
    </div>
  );
}

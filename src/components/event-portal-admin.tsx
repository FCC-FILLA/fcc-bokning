import { canBook, canManageStaff, getProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { driveConfigured, folderUrl } from "@/lib/drive";
import { createClient } from "@/lib/supabase/server";
import {
  addChecklistItem, addDefaultChecklist, deleteChecklistItem, deleteDocument, registerDocument, sendPortalLink, setDocumentFlag,
  setChecklistAssignee, setPortalEnabled, toggleChecklistItem, createProjectFolder,
} from "@/app/(app)/evenemang/eventsida-actions";
import { CopyButton } from "@/components/copy-button";
import { DocumentUpload } from "@/components/document-upload";

type Item = { id: string; title: string; note: string | null; due_date: string | null; days_before: number | null; assignee_id: string | null; customer_visible: boolean; customer_can_check: boolean; done_at: string | null; done_by: string | null };
type Doc = { id: string; name: string; size_bytes: number | null; public: boolean; staff: boolean; created_at: string };

const size = (n: number | null) => (n == null ? "" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/** Kundens eventsida: länk, checklista och dokument. Visas på evenemanget. */
export async function EventPortalAdmin({ eventId, sent, error }: { eventId: string; sent?: string; error?: string }) {
  const p = await getProfile();
  const editor = canBook(p) || canManageStaff(p);
  const supabase = await createClient();
  const [{ data: ev }, { data: items }, { data: docs }, { data: site }, { data: people }] = await Promise.all([
    supabase.from("events").select("share_token, portal_enabled, status, drive_folder_id, contacts(email), companies(email)").eq("id", eventId).single(),
    supabase.from("event_checklist").select("*").eq("event_id", eventId).order("due_date", { nullsFirst: false }).order("sort_order"),
    supabase.from("event_documents").select("id, name, size_bytes, public, staff, created_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("app_settings").select("value").eq("key", "site_url").maybeSingle(),
    supabase.from("profiles").select("id, full_name, email").eq("active", true).in("role", ["admin", "bokare", "produktion"]).order("full_name"),
  ]);
  const staffList = (people ?? []) as { id: string; full_name: string | null; email: string }[];
  const personName = new Map(staffList.map((x) => [x.id, x.full_name || x.email]));
  if (!ev) return null;
  const e = ev as unknown as { drive_folder_id: string | null; share_token: string; portal_enabled: boolean; status: string; contacts: { email: string | null } | null; companies: { email: string | null } | null };
  const active = e.portal_enabled || e.status === "bekraftad" || e.status === "genomford";
  const url = `${site?.value ?? "https://fcc-bokning.vercel.app"}/event/${e.share_token}`;
  const list = (items ?? []) as Item[];
  const documents = (docs ?? []) as Doc[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section id="eventsida" className="card p-5 grid gap-5 scroll-mt-28">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Kundens eventsida</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-st-genomford-soft text-ok" : "bg-sunk text-muted"}`}>
          {active ? "Öppen för kunden" : "Stängd tills evenemanget är bekräftat"}
        </span>
      </div>
      {error && <p className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">{error}</p>}
      {sent && <p className="rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">Länken ligger i e-postkön till kunden.</p>}

      <div className="grid gap-2">
        <p className="text-sm text-muted">
          Kunden ser program och tider, skickade offerter, checklistan och de dokument ni gjort publika. Inga interna anteckningar, kostnader eller
          personaluppgifter.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-sunk px-2 py-1 text-xs">{url}</code>
          <CopyButton text={url} label="Kopiera" />
          <a className="btn btn-ghost" href={`/event/${e.share_token}`} target="_blank" rel="noreferrer">Öppna ↗</a>
          {editor && !active && (
            <form action={setPortalEnabled.bind(null, eventId, true)}><button className="btn" type="submit">Öppna redan nu</button></form>
          )}
          {editor && e.portal_enabled && e.status !== "bekraftad" && e.status !== "genomford" && (
            <form action={setPortalEnabled.bind(null, eventId, false)}><button className="btn btn-ghost" type="submit">Stäng igen</button></form>
          )}
        </div>
        {editor && active && (
          <form action={sendPortalLink.bind(null, eventId)} className="flex flex-wrap items-end gap-2">
            <div className="field">
              <label className="label" htmlFor="portal-to">Skicka länken till</label>
              <input className="input w-72" id="portal-to" name="to" type="email" defaultValue={e.contacts?.email ?? e.companies?.email ?? ""} placeholder="kundens e-post" />
            </div>
            <button className="btn" type="submit">Skicka</button>
          </form>
        )}
      </div>

      <div className="grid gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Checklista och uppgifter</h3>
          <span className="text-sm text-muted">{list.filter((x) => x.done_at).length} av {list.length} klara</span>
          {editor && (
            <form action={addDefaultChecklist.bind(null, eventId)} className="ml-auto">
              <button className="btn btn-ghost text-sm" type="submit">Lägg till standardpunkter</button>
            </form>
          )}
        </div>
        {list.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.map((x) => {
              const late = !x.done_at && x.due_date && x.due_date < today;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <form action={toggleChecklistItem.bind(null, eventId, x.id, !x.done_at)}>
                    <button type="submit" disabled={!editor} aria-label={x.done_at ? `Markera ${x.title} som ej klar` : `Markera ${x.title} som klar`}
                      className={`grid size-5 place-items-center rounded border ${x.done_at ? "bg-ok border-ok text-white" : "border-muted"}`}>
                      {x.done_at ? "✓" : ""}
                    </button>
                  </form>
                  <span className={`flex-1 min-w-48 ${x.done_at ? "line-through text-muted" : ""}`}>
                    {x.title}
                    {x.note && <span className="block text-xs text-muted">{x.note}</span>}
                    {x.done_at && <span className="block text-xs text-muted">Klar {fmtDate(x.done_at)}{x.done_by ? ` av ${x.done_by}` : ""}</span>}
                  </span>
                  {x.due_date && (
                    <span className={`text-sm tabular-nums ${late ? "text-warn font-semibold" : "text-muted"}`}>
                      senast {fmtDate(x.due_date)}{x.days_before != null ? ` (${x.days_before} d före)` : ""}
                    </span>
                  )}
                  {editor ? (
                    <form action={setChecklistAssignee.bind(null, eventId, x.id)} className="flex items-center">
                      <select name="assignee_id" defaultValue={x.assignee_id ?? ""} className="input h-8 py-0 text-xs w-36" aria-label={`Ansvarig för ${x.title}`}>
                        <option value="">Ingen ansvarig</option>
                        {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                      </select>
                      <button className="btn btn-ghost px-1.5 text-xs" type="submit" aria-label="Spara ansvarig">✓</button>
                    </form>
                  ) : (
                    x.assignee_id && <span className="text-xs">{personName.get(x.assignee_id)}</span>
                  )}
                  <span className="text-xs text-muted">{x.customer_visible ? (x.customer_can_check ? "kunden bockar av" : "kunden ser") : "bara internt"}</span>
                  {editor && (
                    <form action={deleteChecklistItem.bind(null, eventId, x.id)}>
                      <button className="btn btn-ghost px-2 text-sm text-warn" type="submit" aria-label={`Ta bort ${x.title}`}>✕</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editor && (
          <form action={addChecklistItem.bind(null, eventId)} className="flex flex-wrap items-end gap-2">
            <div className="field grow min-w-56"><label className="label" htmlFor="cl-title">Ny punkt</label><input className="input" id="cl-title" name="title" required placeholder="T.ex. Skicka gästlista" /></div>
            <div className="field w-28"><label className="label" htmlFor="cl-days">Dagar före</label><input className="input" id="cl-days" name="days_before" type="number" min={-365} max={730} placeholder="t.ex. 14" /></div>
            <div className="field"><label className="label" htmlFor="cl-due">eller datum</label><input className="input" id="cl-due" name="due_date" type="date" /></div>
            <div className="field"><label className="label" htmlFor="cl-who">Ansvarig</label>
              <select className="input" id="cl-who" name="assignee_id" defaultValue="">
                <option value="">Ingen</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="customer_visible" /> Kunden ser</label>
            <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="customer_can_check" /> Kunden bockar av</label>
            <button className="btn" type="submit">Lägg till</button>
          </form>
        )}
      </div>

      <div className="grid gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Dokument</h3>
          <span className="text-xs text-muted">Nya dokument är dolda för kunden.</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {e.drive_folder_id && (
              <a className="btn" href={folderUrl(e.drive_folder_id)} target="_blank" rel="noreferrer">Projektmapp i Drive ↗</a>
            )}
            {editor && (!e.drive_folder_id || !driveConfigured()) && (
              <form action={createProjectFolder.bind(null, eventId)}>
                <button className="btn btn-ghost" type="submit" title={driveConfigured() ? "Kund / år / datum och namn" : "Google Drive är inte kopplat än"}>Skapa projektmapp</button>
              </form>
            )}
          </span>
        </div>
        {documents.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <a className="font-medium hover:underline flex-1 min-w-48 break-all" href={`/evenemang/${eventId}/fil/${d.id}`}>{d.name}</a>
                <span className="text-xs text-muted">{size(d.size_bytes)} · {fmtDate(d.created_at)}</span>
                {editor ? (
                  <>
                    <form action={setDocumentFlag.bind(null, eventId, d.id, "public", !d.public)}>
                      <button className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.public ? "bg-st-genomford-soft text-ok" : "bg-sunk text-muted"}`} type="submit">
                        {d.public ? "Kunden ser" : "Dold för kund"}
                      </button>
                    </form>
                    <form action={setDocumentFlag.bind(null, eventId, d.id, "staff", !d.staff)}>
                      <button className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.staff ? "bg-st-forfragan-soft text-st-forfragan" : "bg-sunk text-muted"}`} type="submit">
                        {d.staff ? "Personal ser" : "Dold för personal"}
                      </button>
                    </form>
                    <form action={deleteDocument.bind(null, eventId, d.id)}>
                      <button className="btn btn-ghost px-2 text-sm text-warn" type="submit" aria-label={`Ta bort ${d.name}`}>✕</button>
                    </form>
                  </>
                ) : (
                  <span className="text-xs text-muted">{d.public ? "Kunden ser" : "Dold för kund"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {editor && <DocumentUpload eventId={eventId} register={registerDocument} />}
      </div>
    </section>
  );
}

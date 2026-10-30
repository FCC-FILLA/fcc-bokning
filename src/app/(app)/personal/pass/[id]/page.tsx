import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { fmtKr } from "@/lib/offert";
import { ASSIGNMENT_LABEL, KIND_LABEL, rateFor, shiftHours, type Assignment, type Shift, type Staff } from "@/lib/personal";
import { getStaffLookups } from "@/lib/personal-data";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { ShiftFields } from "@/components/shift-fields";
import { CopyButton } from "@/components/copy-button";
import { addToQueue, assignDirectly, decide, deleteShift, moveInQueue, removeFromQueue, sendInvites, updateShift } from "../../actions";

type A = Assignment & { staff: Staff | null };

export default async function ShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; ny?: string; inbjudna?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const manager = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const [{ data: s }, { data: a }, lookups] = await Promise.all([
    supabase.from("shifts").select("*, events(id, title), rooms(name)").eq("id", id).maybeSingle(),
    supabase.from("shift_assignments").select("*, staff(*)").eq("shift_id", id).order("applied_at"),
    getStaffLookups(),
  ]);
  if (!s) notFound();
  const shift = s as Shift & { events: { id: string; title: string } | null; rooms: { name: string } | null };
  const all = (a ?? []) as unknown as A[];
  const fn = lookups.functions.find((f) => f.id === shift.function_id);
  const assigned = all.filter((x) => x.status === "tilldelad");
  const applicants = all.filter((x) => x.status === "ansokt");
  const QUEUE = ["vantar", "inbjuden", "avbojd", "utgangen"];
  const chain = shift.staff_kind === "frilans";
  const queue = all.filter((x) => QUEUE.includes(x.status)).sort((p, q) => (p.invite_order ?? 999) - (q.invite_order ?? 999));
  const others = all.filter((x) => !["tilldelad", "ansokt"].includes(x.status) && !(chain && QUEUE.includes(x.status)));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fcc-bokning.vercel.app";
  const hours = shiftHours(shift);
  const cost = assigned.reduce((sum, x) => sum + hours * rateFor(shift, x.staff, fn), 0);

  // Personer som kan läggas till direkt: rätt funktion, rätt typ, aktiva och inte redan tillsatta.
  const { data: skilled } = await supabase
    .from("staff_skills")
    .select("staff(id, name, kind, active)")
    .eq("function_id", shift.function_id);
  const taken = new Set(assigned.map((x) => x.staff_id));
  const candidates = ((skilled ?? []) as unknown as { staff: Pick<Staff, "id" | "name" | "kind" | "active"> | null }[])
    .map((x) => x.staff)
    .filter((x): x is Pick<Staff, "id" | "name" | "kind" | "active"> => !!x && x.active && x.kind === shift.staff_kind && !taken.has(x.id))
    .sort((p, q) => p.name.localeCompare(q.name, "sv"));
  const full = assigned.length >= shift.needed;
  // Vilka som är upptagna under passet (markerat ledigt eller jobbar annat pass).
  const busyIds = [...new Set([...candidates.map((c) => c.id), ...assigned.map((x) => x.staff_id)])];
  const busyList = await Promise.all(
    busyIds.map(async (sid) => {
      const { data } = await supabase.rpc("staff_busy_reason", { p_staff: sid, p_from: shift.starts_at, p_to: shift.ends_at, p_except_shift: id });
      return [sid, (data as string | null) ?? null] as const;
    }),
  );
  const busy = new Map(busyList.filter(([, why]) => !!why) as [string, string][]);
  const optLabel = (c: { id: string; name: string }) => (busy.has(c.id) ? `${c.name} – ${busy.get(c.id)}` : c.name);
  const freeFirst = [...candidates].sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)));

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-2">
        <Link href="/personal" className="text-sm text-muted hover:underline">← Pass</Link>
        <h1 className="text-2xl font-semibold flex items-center gap-3">
          <span className="size-3 rounded-full" style={{ background: fn?.color }} />
          {fn?.name}{shift.title ? ` – ${shift.title}` : ""}
        </h1>
        <p className="text-muted">
          {fmtDate(shift.starts_at)}, {fmtTime(shift.starts_at)}–{fmtTime(shift.ends_at)} ({hours.toLocaleString("sv-SE")} h)
          {shift.rooms ? ` · ${shift.rooms.name}` : ""}
          {shift.events && <> · <Link className="underline underline-offset-2" href={`/evenemang/${shift.events.id}#bemanning`}>{shift.events.title}</Link></>}
          {shift.staff_kind !== "intern" ? ` · ${KIND_LABEL[shift.staff_kind]}` : ""}
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Passet är sparat.</p>}
      {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Passet är skapat{shift.status === "oppen" ? " och syns för personal med rätt funktion" : ""}.</p>}

      <section id="personer" className="card p-5 grid gap-4 scroll-mt-28">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Bemanning</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${full ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>
            {assigned.length}/{shift.needed}
          </span>
          {cost > 0 && <span className="text-sm text-muted">Beräknad kostnad {fmtKr(cost)}</span>}
        </div>

        {applicants.length > 0 && (
          <div className="grid gap-2">
            <h3 className="label">Har sökt ({applicants.length})</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {applicants.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <Link href={`/personal/personer/${x.staff_id}`} className="font-medium hover:underline">{x.staff?.name}</Link>
                  <span className="text-xs text-muted">sökte {fmtDate(x.applied_at)}</span>
                  {busy.has(x.staff_id) && <span className="text-xs text-warn">{busy.get(x.staff_id)}</span>}
                  {manager && (
                    <span className="ml-auto flex gap-2">
                      <form action={decide.bind(null, id, x.staff_id, "tilldelad")}><button className="btn btn-primary text-sm" type="submit" disabled={full}>Ge passet</button></form>
                      <form action={decide.bind(null, id, x.staff_id, "nekad")}><button className="btn btn-ghost text-sm" type="submit">Neka</button></form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-2">
          <h3 className="label">Tilldelade</h3>
          {assigned.length ? (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {assigned.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <Link href={`/personal/personer/${x.staff_id}`} className="font-medium hover:underline">{x.staff?.name}</Link>
                  {x.staff?.phone && <a className="text-sm text-muted" href={`tel:${x.staff.phone}`}>{x.staff.phone}</a>}
                  {manager && (
                    <form action={decide.bind(null, id, x.staff_id, "aterkallad")} className="ml-auto">
                      <ConfirmButton label="Ta bort" question={`Ta bort ${x.staff?.name} från passet?`} confirmLabel="Ta bort" className="btn btn-ghost text-sm text-warn" />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ingen tilldelad ännu.</p>
          )}
        </div>

        {manager && !full && (
          <form action={assignDirectly.bind(null, id)} className="flex flex-wrap items-end gap-3">
            <div className="field min-w-64">
              <label className="label" htmlFor="staff_id">Lägg till direkt</label>
              <select className="input" id="staff_id" name="staff_id" defaultValue="">
                <option value="" disabled>{candidates.length ? "Välj person" : `Ingen ${KIND_LABEL[shift.staff_kind].toLowerCase()} med funktionen ${fn?.name}`}</option>
                {freeFirst.map((c) => <option key={c.id} value={c.id}>{optLabel(c)}</option>)}
              </select>
            </div>
            <button className="btn" type="submit" disabled={!candidates.length}>Lägg till</button>
          </form>
        )}

        {others.length > 0 && (
          <p className="text-sm text-muted">
            {others.map((x) => `${x.staff?.name} (${ASSIGNMENT_LABEL[x.status].toLowerCase()})`).join(", ")}
          </p>
        )}
      </section>

      {chain && (
        <section id="inbjudningar" className="card p-5 grid gap-4 scroll-mt-28">
          <div>
            <h2 className="text-lg font-semibold">Inbjudningar</h2>
            <p className="text-sm text-muted">
              Lägg personerna i den ordning de ska tillfrågas. De första får frågan, och svarar någon nej eller inte inom {shift.respond_hours ?? 24} h går frågan
              vidare till nästa tills passet är fullt.
            </p>
          </div>
          {sp.inbjudna && <p className="rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">{sp.inbjudna === "0" ? "Ingen ny att fråga just nu." : `${sp.inbjudna} ${sp.inbjudna === "1" ? "person har" : "personer har"} fått frågan.`}</p>}
          {queue.length > 0 ? (
            <ol className="divide-y divide-line rounded-lg border border-line">
              {queue.map((x, i) => {
                const link = `${site}/pass/${x.staff?.link_token}`;
                const sms = `Hej! Vi undrar om du kan jobba som ${fn?.name?.toLowerCase()} ${fmtDate(shift.starts_at)} ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}. Svara här: ${link}`;
                const tone =
                  x.status === "inbjuden" ? "bg-st-preliminar-soft text-st-preliminar" : x.status === "vantar" ? "bg-sunk text-muted" : "bg-warn-soft text-warn";
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="w-6 text-sm text-muted tabular-nums">{i + 1}.</span>
                    <Link href={`/personal/personer/${x.staff_id}`} className="font-medium hover:underline">{x.staff?.name}</Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
                      {ASSIGNMENT_LABEL[x.status]}
                      {x.status === "inbjuden" && x.respond_by ? ` · svar senast ${fmtDate(x.respond_by)} ${fmtTime(x.respond_by)}` : ""}
                    </span>
                    {busy.has(x.staff_id) && x.status === "vantar" && <span className="text-xs text-warn">{busy.get(x.staff_id)}, hoppas över</span>}
                    {manager && (
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {x.status === "inbjuden" && (
                          <>
                            <CopyButton text={sms} label="Kopiera sms-text" />
                            {x.staff?.email && (
                              <a className="btn btn-ghost text-sm" href={`mailto:${x.staff.email}?subject=${encodeURIComponent(`Förfrågan: ${fn?.name} ${fmtDate(shift.starts_at)}`)}&body=${encodeURIComponent(sms)}`}>E-post</a>
                            )}
                          </>
                        )}
                        {x.status === "vantar" && (
                          <>
                            <form action={moveInQueue.bind(null, id, x.id, -1)}><button className="btn btn-ghost px-2 text-sm" type="submit" aria-label="Flytta upp">↑</button></form>
                            <form action={moveInQueue.bind(null, id, x.id, 1)}><button className="btn btn-ghost px-2 text-sm" type="submit" aria-label="Flytta ner">↓</button></form>
                          </>
                        )}
                        {x.status !== "inbjuden" && (
                          <form action={removeFromQueue.bind(null, id, x.id)}><button className="btn btn-ghost px-2 text-sm text-warn" type="submit" aria-label={`Ta bort ${x.staff?.name}`}>✕</button></form>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">Ingen i kön ännu.</p>
          )}
          {manager && (
            <div className="flex flex-wrap items-end gap-3">
              <form action={addToQueue.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <div className="field min-w-64">
                  <label className="label" htmlFor="queue-staff">Lägg till i kön</label>
                  <select className="input" id="queue-staff" name="staff_id" defaultValue="">
                    <option value="" disabled>{candidates.length ? "Välj frilansare" : `Ingen frilansare med funktionen ${fn?.name}`}</option>
                    {freeFirst.filter((c) => !queue.some((q) => q.staff_id === c.id)).map((c) => <option key={c.id} value={c.id}>{optLabel(c)}</option>)}
                  </select>
                </div>
                <button className="btn" type="submit">Lägg till</button>
              </form>
              {queue.some((q) => q.status === "vantar") && !full && (
                <form action={sendInvites.bind(null, id)}>
                  <button className="btn btn-primary" type="submit">Skicka frågan</button>
                </form>
              )}
            </div>
          )}
          <p className="text-xs text-muted">
            Inbjudningarna läggs i e-postkön och skickas automatiskt när e-post är kopplat. Tills dess kan du skicka länken med sms eller e-post härifrån.
          </p>
        </section>
      )}

      <form action={updateShift.bind(null, id)} className="card p-5 grid gap-4">
        <h2 className="text-lg font-semibold">Uppgifter</h2>
        <fieldset disabled={!manager}>
          <ShiftFields functions={lookups.functions} events={lookups.events} rooms={lookups.rooms} suppliers={lookups.suppliers} shift={shift} />
        </fieldset>
        {manager && <div><button className="btn btn-primary" type="submit">Spara passet</button></div>}
      </form>


      {manager && (
        <form action={deleteShift.bind(null, id)}>
          <ConfirmButton label="Ta bort passet" question="Passet och alla ansökningar tas bort." confirmLabel="Ta bort" />
        </form>
      )}
    </div>
  );
}

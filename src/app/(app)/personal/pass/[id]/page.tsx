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
import { assignDirectly, decide, deleteShift, updateShift } from "../../actions";

type A = Assignment & { staff: Staff | null };

export default async function ShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; ny?: string }>;
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
  const others = all.filter((x) => !["tilldelad", "ansokt"].includes(x.status));
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
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

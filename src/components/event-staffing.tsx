import Link from "next/link";
import { canManageStaff, getProfile } from "@/lib/auth";
import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { fmtKr } from "@/lib/offert";
import { rateFor, shiftHours, staffingSummary, type Shift, type Staff } from "@/lib/personal";
import { getStaffLookups } from "@/lib/personal-data";
import { createClient } from "@/lib/supabase/server";
import { createShift } from "@/app/(app)/personal/actions";
import { ShiftFields } from "@/components/shift-fields";

type Row = Shift & { shift_assignments: { status: string; staff: Pick<Staff, "hourly_rate"> | null }[]; rooms: { name: string } | null };

/** Bemanningen på ett evenemang: "Garderob 8/10", passen och ett snabbformulär för nya pass. */
export async function EventStaffing({ eventId, firstDate, created }: { eventId: string; firstDate: string | null; created?: string }) {
  const manager = canManageStaff(await getProfile());
  const supabase = await createClient();
  const [{ data }, lookups] = await Promise.all([
    supabase.from("shifts").select("*, rooms(name), shift_assignments(status, staff(hourly_rate))").eq("event_id", eventId).order("starts_at"),
    getStaffLookups(),
  ]);
  const shifts = (data ?? []) as unknown as Row[];
  const fns = lookups.functions;
  const summary = staffingSummary(
    shifts,
    shifts.flatMap((s) => s.shift_assignments.map((a) => ({ shift_id: s.id, status: a.status as "tilldelad" }))),
    fns,
  );
  const cost = shifts.reduce(
    (sum, s) =>
      sum +
      s.shift_assignments
        .filter((a) => a.status === "tilldelad")
        .reduce((x, a) => x + shiftHours(s) * rateFor(s, a.staff, fns.find((f) => f.id === s.function_id)), 0),
    0,
  );

  return (
    <section id="bemanning" className="card p-5 grid gap-4 scroll-mt-28">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Bemanning</h2>
        {summary.map((x) => (
          <span
            key={x.fn.id}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm ${x.filled >= x.needed ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}
          >
            <span className="size-2 rounded-full" style={{ background: x.fn.color }} />
            {x.fn.name} <span className="font-semibold tabular-nums">{x.filled}/{x.needed}</span>
          </span>
        ))}
        {cost > 0 && <span className="text-sm text-muted ml-auto">Personalkostnad {fmtKr(cost)}</span>}
      </div>
      {created && <p className="rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">{created === "1" ? "Passet är skapat." : `${created} pass är skapade.`}</p>}

      {shifts.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {shifts.map((s) => {
            const filled = s.shift_assignments.filter((a) => a.status === "tilldelad").length;
            const applied = s.shift_assignments.filter((a) => a.status === "ansokt").length;
            const fn = fns.find((f) => f.id === s.function_id);
            return (
              <li key={s.id}>
                <Link href={`/personal/pass/${s.id}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[170px_160px_1fr_auto] items-center gap-3 px-3 py-2 hover:bg-sunk">
                  <span className="tabular-nums text-sm">{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                  <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: fn?.color }} />{fn?.name}</span>
                  <span className="text-sm text-muted truncate">{[s.title, s.rooms?.name].filter(Boolean).join(" · ")}</span>
                  <span className="flex items-center gap-2 justify-self-end">
                    {applied > 0 && <span className="rounded-full bg-st-preliminar-soft text-st-preliminar px-2 text-xs font-semibold">{applied} sökt</span>}
                    <span className={`rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${filled >= s.needed ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>{filled}/{s.needed}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Inga pass ännu.</p>
      )}

      {manager && (
        <details>
          <summary className="cursor-pointer font-medium text-brand">+ Lägg till pass</summary>
          <form action={createShift} className="grid gap-4 mt-3">
            <input type="hidden" name="back" value={`/evenemang/${eventId}`} />
            <input type="hidden" name="event_id" value={eventId} />
            <ShiftFields
              functions={fns}
              events={[]}
              rooms={lookups.rooms}
              suppliers={lookups.suppliers}
              defaults={{ date: firstDate ?? isoToDate(new Date().toISOString()) }}
              hideEvent
              allowDays
            />
            <div><button className="btn btn-primary" type="submit">Skapa pass</button></div>
          </form>
        </details>
      )}
    </section>
  );
}

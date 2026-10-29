import Link from "next/link";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { addDays, dayStartIso, fmtDate, fmtTime, isoToDate, todayDate, weekday } from "@/lib/datum";
import { KIND_LABEL, type Shift } from "@/lib/personal";
import { getStaffLookups } from "@/lib/personal-data";
import { createClient } from "@/lib/supabase/server";
import { ShiftFields } from "@/components/shift-fields";
import { createShift } from "./actions";

export const metadata = { title: "Pass" };

type Row = Shift & {
  staff_functions: { name: string; color: string } | null;
  events: { title: string } | null;
  rooms: { name: string } | null;
  shift_assignments: { status: string }[];
};

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ fran?: string; dagar?: string; funktion?: string; bara?: string; fel?: string; passskapat?: string; nytt?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const manager = canManageStaff(profile);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.fran ?? "") ? sp.fran! : todayDate();
  const days = [7, 14, 31, 92].includes(Number(sp.dagar)) ? Number(sp.dagar) : 31;
  const supabase = await createClient();
  const lookups = await getStaffLookups();

  let q = supabase
    .from("shifts")
    .select("*, staff_functions(name, color), events(title), rooms(name), shift_assignments(status)")
    .gte("ends_at", dayStartIso(from))
    .lt("starts_at", dayStartIso(addDays(from, days)))
    .order("starts_at");
  if (sp.funktion) q = q.eq("function_id", sp.funktion);
  const { data } = await q;
  let shifts = (data ?? []) as unknown as Row[];
  const count = (s: Row, status: string) => s.shift_assignments.filter((a) => a.status === status).length;
  if (sp.bara === "obemannade") shifts = shifts.filter((s) => count(s, "tilldelad") < s.needed);
  if (sp.bara === "sokande") shifts = shifts.filter((s) => count(s, "ansokt") > 0);

  const byDay = new Map<string, Row[]>();
  for (const s of shifts) byDay.set(isoToDate(s.starts_at), [...(byDay.get(isoToDate(s.starts_at)) ?? []), s]);
  const totalNeeded = shifts.reduce((n, s) => n + s.needed, 0);
  const totalFilled = shifts.reduce((n, s) => n + Math.min(count(s, "tilldelad"), s.needed), 0);
  const totalApplicants = shifts.reduce((n, s) => n + count(s, "ansokt"), 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Pass</h1>
          <p className="text-sm text-muted">
            {shifts.length} pass · {totalFilled} av {totalNeeded} platser tillsatta
            {totalApplicants ? ` · ${totalApplicants} ansökningar att hantera` : ""}
          </p>
        </div>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.passskapat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.passskapat === "1" ? "Passet är skapat." : `${sp.passskapat} pass är skapade.`}</p>}

      {manager && (
        <details id="nytt-pass" className="card p-5 scroll-mt-28" open={!shifts.length || sp.nytt === "1"}>
          <summary className="cursor-pointer font-semibold">+ Nytt pass</summary>
          <form action={createShift} className="grid gap-4 mt-4">
            <input type="hidden" name="back" value="/personal" />
            <ShiftFields functions={lookups.functions} events={lookups.events} rooms={lookups.rooms} suppliers={lookups.suppliers} defaults={{ date: from }} allowDays />
            <div className="flex gap-3">
              <button className="btn btn-primary" type="submit">Skapa pass</button>
              <button className="btn" type="submit" name="open_after" value="1">Skapa och öppna</button>
            </div>
          </form>
        </details>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="field">
          <label className="label" htmlFor="fran">Från</label>
          <input className="input" id="fran" name="fran" type="date" defaultValue={from} />
        </div>
        <div className="field">
          <label className="label" htmlFor="dagar">Period</label>
          <select className="input" id="dagar" name="dagar" defaultValue={String(days)}>
            <option value="7">1 vecka</option>
            <option value="14">2 veckor</option>
            <option value="31">1 månad</option>
            <option value="92">3 månader</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="funktion">Funktion</label>
          <select className="input" id="funktion" name="funktion" defaultValue={sp.funktion ?? ""}>
            <option value="">Alla</option>
            {lookups.functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="bara">Visa</label>
          <select className="input" id="bara" name="bara" defaultValue={sp.bara ?? ""}>
            <option value="">Alla pass</option>
            <option value="obemannade">Ej fullt bemannade</option>
            <option value="sokande">Med nya ansökningar</option>
          </select>
        </div>
        <button className="btn" type="submit">Visa</button>
      </form>

      {byDay.size === 0 ? (
        <div className="card p-8 text-center text-muted">Inga pass i perioden.</div>
      ) : (
        <div className="grid gap-4">
          {[...byDay].map(([date, list]) => (
            <section key={date} className="grid gap-2">
              <h2 className={`font-display font-semibold ${weekday(date) >= 5 ? "text-brand" : ""}`}>{fmtDate(date)}</h2>
              <ul className="card divide-y divide-line">
                {list.map((s) => {
                  const filled = count(s, "tilldelad");
                  const applicants = count(s, "ansokt");
                  const full = filled >= s.needed;
                  return (
                    <li key={s.id}>
                      <Link href={`/personal/pass/${s.id}`} className="grid grid-cols-[90px_1fr_auto] sm:grid-cols-[110px_180px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-sunk">
                        <span className="tabular-nums text-sm">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                        <span className="flex items-center gap-2 font-medium">
                          <span className="size-2.5 rounded-full shrink-0" style={{ background: s.staff_functions?.color }} />
                          {s.staff_functions?.name}
                        </span>
                        <span className="col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto text-sm text-muted truncate">
                          {[s.events?.title, s.title, s.rooms?.name].filter(Boolean).join(" · ") || "Fristående pass"}
                          {s.staff_kind !== "intern" && <span className="ml-2 rounded-full bg-sunk px-2 text-xs">{KIND_LABEL[s.staff_kind]}</span>}
                          {s.status !== "oppen" && <span className="ml-2 rounded-full bg-sunk px-2 text-xs">{s.status === "utkast" ? "Utkast" : "Stängd"}</span>}
                        </span>
                        <span className="flex items-center gap-2 justify-self-end">
                          {applicants > 0 && <span className="rounded-full bg-st-preliminar-soft text-st-preliminar px-2 text-xs font-semibold">{applicants} sökt</span>}
                          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${full ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>
                            {filled}/{s.needed}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

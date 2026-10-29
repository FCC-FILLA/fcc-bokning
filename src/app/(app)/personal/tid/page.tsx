import Link from "next/link";
import { canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime, isoToDate, isoToLocal, todayDate } from "@/lib/datum";
import { fmtKr } from "@/lib/offert";
import { ATTEST_LABEL, KIND_LABEL, monthLabel, type AttestStatus } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";
import { loadMonth, type MonthRow } from "@/lib/tid";
import { ConfirmButton } from "@/components/confirm-button";
import { attest, attestAll, lockMonth, reject, savePayrollEmail, setTime, unlockMonth } from "./actions";

export const metadata = { title: "Tid och attest" };

const shift = (m: string, d: number) => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

const CHIP: Record<AttestStatus, string> = {
  "": "bg-sunk text-muted",
  rapporterad: "bg-st-preliminar-soft text-st-preliminar",
  attesterad: "bg-st-genomford-soft text-ok",
  avvisad: "bg-warn-soft text-warn",
};

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ manad?: string; fel?: string; attesterade?: string; avvisad?: string; sparad?: string; last?: string; upplast?: string; visa?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const manager = canManageStaff(profile);
  const month = /^\d{4}-\d{2}$/.test(sp.manad ?? "") ? sp.manad! : todayDate().slice(0, 7);
  const supabase = await createClient();
  const [{ rows, period, lockedByName }, { data: setting }] = await Promise.all([
    loadMonth(supabase, month),
    supabase.from("app_settings").select("value").eq("key", "payroll_email").maybeSingle(),
  ]);
  const payrollEmail = (setting?.value as string | undefined) ?? "";
  const locked = !!period?.locked_at;
  const now = new Date().toISOString();
  const filter = sp.visa ?? "";
  const shown = rows.filter((r) => (filter === "att" ? r.attest_status === "rapporterad" : filter === "saknas" ? r.attest_status === "" && r.shifts.ends_at < now : true));

  const count = (s: AttestStatus) => rows.filter((r) => r.attest_status === s).length;
  const missing = rows.filter((r) => r.attest_status === "" && r.shifts.ends_at < now).length;
  const attested = rows.filter((r) => r.attest_status === "attesterad");
  const hours = attested.reduce((s, r) => s + (r.hours ?? 0), 0);
  const amount = attested.reduce((s, r) => s + (r.amount ?? 0), 0);
  const ownRows = rows.filter((r) => r.staff.profile_id === profile.id && r.attest_status === "rapporterad").length;

  const byPerson = new Map<string, MonthRow[]>();
  for (const r of shown) byPerson.set(r.staff_id, [...(byPerson.get(r.staff_id) ?? []), r]);

  const mailto = payrollEmail
    ? `mailto:${payrollEmail}?subject=${encodeURIComponent(`Tidsunderlag ${monthLabel(month)}`)}&body=${encodeURIComponent(
        `Hej!\n\nHär kommer attesterat tidsunderlag för ${monthLabel(month)}: ${attested.length} pass, ${hours.toLocaleString("sv-SE")} timmar, ${fmtKr(amount)}.\n\nExcel-filen är bifogad.\n\nHälsningar`,
      )}`
    : null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Tid och attest</h1>
          <p className="text-sm text-muted">Rapporterad tid per pass. Attestera, lås månaden och skicka underlaget till ekonomi.</p>
        </div>
        <span className="flex-1" />
        <nav className="flex items-center gap-1" aria-label="Månad">
          <Link className="btn btn-ghost" href={`/personal/tid?manad=${shift(month, -1)}`} aria-label="Föregående månad">←</Link>
          <span className="min-w-36 text-center font-display font-semibold capitalize">{monthLabel(month)}</span>
          <Link className="btn btn-ghost" href={`/personal/tid?manad=${shift(month, 1)}`} aria-label="Nästa månad">→</Link>
        </nav>
      </div>

      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.attesterade && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.attesterade} pass attesterade.</p>}
      {sp.avvisad && <p className="rounded-lg bg-sunk px-4 py-3 text-sm">Tiden är avvisad och personen ser din kommentar.</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {sp.last && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Månaden är låst. Ladda ner underlaget och skicka det till ekonomi.</p>}
      {sp.upplast && <p className="rounded-lg bg-sunk px-4 py-3 text-sm">Månaden är upplåst.</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Att attestera" value={count("rapporterad")} tone={count("rapporterad") ? "warn" : undefined} href={`/personal/tid?manad=${month}&visa=att`} />
        <Stat label="Saknar tidrapport" value={missing} tone={missing ? "warn" : undefined} href={`/personal/tid?manad=${month}&visa=saknas`} />
        <Stat label="Attesterade timmar" value={hours.toLocaleString("sv-SE")} />
        <Stat label="Attesterat belopp" value={fmtKr(amount)} />
      </div>

      <section className={`card p-5 grid gap-3 ${locked ? "border-l-4 border-l-ok" : ""}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{locked ? "Månaden är låst" : "Lås och skicka"}</h2>
          {locked && <span className="text-sm text-muted">{fmtDate(period!.locked_at!)}{lockedByName ? ` av ${lockedByName}` : ""}{period?.exported_at ? ` · underlaget hämtat ${fmtDate(period.exported_at)}` : ""}</span>}
        </div>
        {!locked && (
          <p className="text-sm text-muted">
            När månaden är låst går det inte att ändra eller rapportera tid för pass i månaden. Ej attesterade pass följer med i underlaget men räknas inte i summeringen.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {manager && !locked && count("rapporterad") > 0 && (
            <form action={attestAll.bind(null, month)}>
              <button className="btn btn-primary" type="submit">Attestera alla rapporterade{ownRows ? ` (utom dina ${ownRows})` : ""}</button>
            </form>
          )}
          {manager && !locked && (
            <form action={lockMonth.bind(null, month)}>
              <ConfirmButton
                label="Lås månaden"
                question={count("rapporterad") + missing > 0 ? `${count("rapporterad")} ej attesterade och ${missing} utan tidrapport. Lås ändå?` : `Lås ${monthLabel(month)}?`}
                confirmLabel="Lås"
                className="btn"
              />
            </form>
          )}
          <a className="btn" href={`/personal/tid/excel?manad=${month}`}>Ladda ner Excel</a>
          {mailto && locked && <a className="btn" href={mailto}>Mejla ekonomi</a>}
          {locked && isAdmin(profile) && (
            <form action={unlockMonth.bind(null, month)}>
              <ConfirmButton label="Lås upp" question="Låsa upp månaden så att tid kan ändras igen?" confirmLabel="Lås upp" className="btn btn-ghost" />
            </form>
          )}
        </div>
        {isAdmin(profile) && (
          <form action={savePayrollEmail.bind(null, month)} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <div className="field">
              <label className="label" htmlFor="payroll_email">Ekonomi (e-post för underlaget)</label>
              <input className="input w-72" id="payroll_email" name="payroll_email" type="email" defaultValue={payrollEmail} placeholder="ekonomi@filadelfiacc.se" />
            </div>
            <button className="btn btn-ghost" type="submit">Spara</button>
            <span className="text-xs text-muted pb-2">När e-post är kopplat skickas underlaget automatiskt när månaden låses.</span>
          </form>
        )}
      </section>

      <div className="flex flex-wrap gap-2 text-sm">
        {[["", "Alla"], ["att", "Att attestera"], ["saknas", "Saknar tidrapport"]].map(([v, l]) => (
          <Link key={v} href={`/personal/tid?manad=${month}${v ? `&visa=${v}` : ""}`} className={`btn ${filter === v ? "btn-primary" : ""}`}>{l}</Link>
        ))}
      </div>

      {byPerson.size === 0 ? (
        <div className="card p-8 text-center text-muted">Inga pass här.</div>
      ) : (
        [...byPerson].map(([staffId, list]) => {
          const p = list[0].staff;
          const h = list.reduce((s, r) => s + (r.hours ?? 0), 0);
          return (
            <section key={staffId} className="card overflow-hidden">
              <header className="flex flex-wrap items-center gap-3 bg-sunk px-4 py-2">
                <Link href={`/personal/personer/${staffId}`} className="font-semibold hover:underline">{p.name}</Link>
                <span className="text-xs text-muted">{KIND_LABEL[p.kind]}{p.company ? ` · ${p.company}` : ""}</span>
                <span className="ml-auto text-sm tabular-nums">{list.length} pass · {h.toLocaleString("sv-SE")} h</span>
              </header>
              <ul className="divide-y divide-line">
                {list.map((r) => (
                  <TimeLine key={r.id} r={r} month={month} manager={manager && !locked} own={r.staff.profile_id === profile.id} past={r.shifts.ends_at < now} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string | number; tone?: "warn"; href?: string }) {
  const inner = (
    <>
      <span className="label">{label}</span>
      <span className={`font-display text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}>{value}</span>
    </>
  );
  return href ? <Link href={href} className="card p-4 grid gap-1 hover:border-muted">{inner}</Link> : <div className="card p-4 grid gap-1">{inner}</div>;
}

function TimeLine({ r, month, manager, own, past }: { r: MonthRow; month: string; manager: boolean; own: boolean; past: boolean }) {
  const planned = `${fmtTime(r.shifts.starts_at)}–${fmtTime(r.shifts.ends_at)}`;
  const actual = r.actual_start && r.actual_end ? `${fmtTime(r.actual_start)}–${fmtTime(r.actual_end)}${r.break_minutes ? `, rast ${r.break_minutes} min` : ""}` : null;
  const startLocal = isoToLocal(r.actual_start ?? r.shifts.starts_at);
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_200px_80px_130px] items-center gap-x-3 gap-y-1">
        <span className="text-sm tabular-nums">{fmtDate(r.shifts.starts_at)}</span>
        <span className="text-sm min-w-0 truncate">
          <span className="inline-block size-2 rounded-full mr-1.5" style={{ background: r.fn?.color }} />
          {r.fn?.name}
          <span className="text-muted">{r.shifts.events?.title ? ` · ${r.shifts.events.title}` : r.shifts.title ? ` · ${r.shifts.title}` : ""}</span>
        </span>
        <span className="text-sm tabular-nums">
          {actual ?? <span className="text-muted">Planerat {planned}</span>}
          {actual && actual.slice(0, 11) !== planned && <span className="block text-xs text-muted">planerat {planned}</span>}
        </span>
        <span className="text-sm tabular-nums text-right">{r.hours != null ? `${r.hours.toLocaleString("sv-SE")} h` : ""}</span>
        <span className={`justify-self-end rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[r.attest_status]}`}>
          {r.attest_status === "" && !past ? "Kommande" : ATTEST_LABEL[r.attest_status]}
        </span>
      </div>
      {(r.report_comment || r.attest_comment) && (
        <p className="text-xs text-muted">
          {r.report_comment && <>Kommentar: {r.report_comment}. </>}
          {r.attest_comment && <>Avvisad: {r.attest_comment}{r.attestedByName ? "" : ""}</>}
        </p>
      )}
      {r.attest_status === "attesterad" && r.attestedByName && <p className="text-xs text-muted">Attesterad av {r.attestedByName}</p>}
      {manager && (
        <div className="flex flex-wrap items-center gap-2">
          {r.attest_status === "rapporterad" && !own && (
            <form action={attest.bind(null, month, [r.id])}><button className="btn btn-primary text-sm" type="submit">Attestera</button></form>
          )}
          {r.attest_status === "rapporterad" && own && <span className="text-xs text-muted">Din egen tid attesteras av någon annan.</span>}
          {(r.attest_status === "rapporterad" || r.attest_status === "attesterad") && (
            <details>
              <summary className="btn btn-ghost text-sm cursor-pointer">Avvisa</summary>
              <form action={reject.bind(null, month, r.id)} className="mt-2 flex flex-wrap gap-2">
                <input className="input w-72" name="comment" placeholder="Varför? Personen ser kommentaren." />
                <button className="btn text-sm" type="submit">Avvisa tiden</button>
              </form>
            </details>
          )}
          {(past || r.actual_start) && (
            <details>
              <summary className="btn btn-ghost text-sm cursor-pointer">{r.actual_start ? "Ändra tid" : "Rapportera åt"}</summary>
              <form action={setTime.bind(null, month, r.id)} className="mt-2 flex flex-wrap items-end gap-2">
                <input className="input w-40" type="date" name="date" defaultValue={isoToDate(r.actual_start ?? r.shifts.starts_at)} aria-label="Datum" required />
                <input className="input w-28" type="time" name="from" step={300} defaultValue={startLocal.slice(11)} aria-label="Start" required />
                <input className="input w-28" type="time" name="to" step={300} defaultValue={isoToLocal(r.actual_end ?? r.shifts.ends_at).slice(11)} aria-label="Slut" required />
                <input className="input w-24" type="number" name="break" min={0} max={600} defaultValue={r.break_minutes ?? 0} aria-label="Rast i minuter" />
                <input className="input w-56" name="comment" defaultValue={r.report_comment ?? ""} placeholder="Kommentar" aria-label="Kommentar" />
                <button className="btn text-sm" type="submit">Spara</button>
              </form>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

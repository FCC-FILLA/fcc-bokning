import { StaffInfoBlocks, type StaffInfoBlock } from "@/components/staff-info";
import { EventInfo, type StaffEventInfo } from "@/components/event-info";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate, fmtTime, isoToDate, isoToLocal } from "@/lib/datum";
import { loadCompany } from "@/lib/foretag";
import { ATTEST_LABEL, shiftHours, workedHours, type AttestStatus } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";
import { addLinkUnavailability, removeLinkUnavailability, reportTime, respond, saveLinkDetails } from "./actions";
import { StaffDetailsForm, type StaffDetails } from "@/components/staff-details-form";
import { UnavailabilityForm, type Unavailable } from "@/components/unavailability";

export const metadata: Metadata = { title: "Mina pass", robots: { index: false, follow: false } };

type LinkShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  function: string;
  color: string;
  title: string | null;
  note: string | null;
  event: string | null;
  event_info: StaffEventInfo | null;
  room: string | null;
  needed: number;
  status: "tilldelad" | "inbjuden";
  respond_by: string | null;
  actual_start: string | null;
  actual_end: string | null;
  break_minutes: number | null;
  report_comment: string | null;
  attest_status: AttestStatus | null;
  attest_comment: string | null;
  locked: boolean;
};

/** Personlig sida för frilansare och leverantörer, utan inloggning. */
export default async function LinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ fel?: string; ja?: string; nej?: string; tid?: string; uppgifter?: string; ledig?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const supabase = await createClient();
  const [{ data }, company, { data: details }, { data: info }] = await Promise.all([
    supabase.rpc("link_shifts", { p_token: token }),
    loadCompany(supabase),
    supabase.rpc("link_details", { p_token: token }),
    supabase.rpc("link_staff_info", { p_token: token }),
  ]);
  const { data: unavail } = await supabase.rpc("link_unavailability", { p_token: token });
  if (!data) notFound();
  const doc = data as { name: string; company: string | null; kind: "frilans" | "leverantor"; shifts: LinkShift[] };
  const now = new Date().toISOString();
  const supplier = doc.kind === "leverantor";
  const pending = doc.shifts.filter((s) => s.status === "inbjuden" && s.ends_at >= now);
  const needsReport = (s: LinkShift) => s.status === "tilldelad" && s.ends_at < now && !s.locked && (!s.attest_status || s.attest_status === "avvisad");
  const upcoming = doc.shifts.filter((s) => s.status === "tilldelad" && (s.ends_at >= now || needsReport(s)));
  const past = doc.shifts.filter((s) => s.status === "tilldelad" && s.ends_at < now && !needsReport(s)).reverse();

  const group = (list: LinkShift[]) => {
    const m = new Map<string, LinkShift[]>();
    for (const s of list) m.set(isoToDate(s.starts_at), [...(m.get(isoToDate(s.starts_at)) ?? []), s]);
    return [...m];
  };

  const card = (s: LinkShift, withDate = false) => (
    <article key={s.id} id={`pass-${s.id}`} className="card p-4 grid gap-2 border-l-4 scroll-mt-4" style={{ borderLeftColor: s.color }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{s.function}{s.title ? ` · ${s.title}` : ""}{supplier && s.needed > 1 ? ` · ${s.needed} personer` : ""}</p>
        <p className="tabular-nums font-medium">
          {withDate && <span className="capitalize">{fmtDate(s.starts_at)} </span>}
          {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)} <span className="text-sm text-muted">({shiftHours(s).toLocaleString("sv-SE")} h)</span>
        </p>
      </div>
      {(s.event || s.room) && <p className="text-sm text-muted">{[s.event, s.room].filter(Boolean).join(" · ")}</p>}
      {s.note && <p className="text-sm">{s.note}</p>}
      {s.event_info && <EventInfo info={s.event_info} docHref={(id) => `/pass/${token}/fil/${id}`} functionId={s.function} />}
      {s.status === "inbjuden" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2">
          <form action={respond.bind(null, token, s.id, true)}><button className="btn btn-primary" type="submit">{supplier ? "Bekräfta bokningen" : "Ja, jag tar passet"}</button></form>
          {!supplier && <form action={respond.bind(null, token, s.id, false)}><button className="btn" type="submit">Nej tack</button></form>}
          {s.respond_by && <span className="text-sm text-muted">Svara senast {fmtDate(s.respond_by)} {fmtTime(s.respond_by)}</span>}
        </div>
      )}
      {s.status === "tilldelad" && <TimeBlock s={s} token={token} now={now} />}
    </article>
  );

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-brand text-white">
        <div className="mx-auto max-w-2xl px-4 py-5 grid gap-2">
          <p className="font-display font-semibold tracking-wide text-sm uppercase">{company.name}</p>
          <h1 className="font-display text-2xl font-semibold">{supplier && doc.company ? doc.company : doc.name}</h1>
          <p className="text-sm opacity-85">
            {pending.length ? `${pending.length} ${supplier ? "att bekräfta" : pending.length === 1 ? "förfrågan att svara på" : "förfrågningar att svara på"} · ` : ""}
            {upcoming.length
              ? `${upcoming.length} kommande ${supplier ? (upcoming.length === 1 ? "bokning" : "bokningar") : "pass"}`
              : `Inga kommande ${supplier ? "bokningar" : "pass"}`}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5 grid gap-5">
        {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
        {sp.ja && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{supplier ? "Tack! Bokningen är bekräftad." : "Tack! Passet är ditt."}</p>}
        {sp.nej && <p className="rounded-lg bg-sunk px-4 py-3 text-sm">Tack för beskedet.</p>}
        {sp.tid && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Tiden är rapporterad.</p>}

        {pending.length > 0 && (
          <section className="grid gap-2">
            <h2 className="font-display text-lg font-semibold">{supplier ? "Att bekräfta" : "Förfrågningar"}</h2>
            {pending.map((s) => card(s, true))}
          </section>
        )}

        {group(upcoming).map(([date, list]) => (
          <section key={date} className="grid gap-2">
            <h2 className="font-display font-semibold">{fmtDate(date)}</h2>
            {list.map((s) => card(s))}
          </section>
        ))}

        {past.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer font-medium">Tidigare ({past.length})</summary>
            <ul className="mt-3 grid gap-1 text-sm">
              {past.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular-nums w-44">{fmtDate(s.starts_at)} {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                  <span>{s.function}</span>
                  <span className="text-muted">{s.event}</span>
                  <span className="ml-auto text-xs">{ATTEST_LABEL[(s.attest_status ?? "") as AttestStatus]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {((info ?? []) as StaffInfoBlock[]).length > 0 && (
          <details className="card p-4" open={!pending.length && !upcoming.length}>
            <summary className="cursor-pointer font-medium">Bra att veta</summary>
            <div className="mt-3"><StaffInfoBlocks blocks={(info ?? []) as StaffInfoBlock[]} /></div>
          </details>
        )}
        {!supplier && (
          <details id="ledighet" className="card p-4 scroll-mt-4" open={!!sp.ledig}>
            <summary className="cursor-pointer font-medium">När jag inte kan jobba</summary>
            <div className="mt-3">
              <UnavailabilityForm list={(unavail ?? []) as Unavailable[]} add={addLinkUnavailability.bind(null, token)} remove={removeLinkUnavailability.bind(null, token)} />
            </div>
          </details>
        )}
        {details && (
          <details id="uppgifter" className="card p-4 scroll-mt-4" open={!!sp.uppgifter}>
            <summary className="cursor-pointer font-medium">{supplier ? "Våra uppgifter" : "Mina uppgifter"}</summary>
            {sp.uppgifter && <p className="mt-3 rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">Tack! Uppgifterna är sparade.</p>}
            <div className="mt-4">
              <StaffDetailsForm d={details as StaffDetails} action={saveLinkDetails.bind(null, token)} />
            </div>
          </details>
        )}
        <p className="text-xs text-muted">Den här sidan är personlig. Dela inte länken.</p>
      </main>
    </div>
  );
}

function TimeBlock({ s, token, now }: { s: LinkShift; token: string; now: string }) {
  if (new Date(s.starts_at).getTime() - 2 * 3_600_000 > new Date(now).getTime()) return null;
  const status = (s.attest_status ?? "") as AttestStatus;
  const editable = !s.locked && status !== "attesterad";
  const hours = workedHours({ actual_start: s.actual_start, actual_end: s.actual_end, break_minutes: s.break_minutes });
  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <p className="text-sm">
        <span className="font-medium">{status === "rapporterad" ? "Väntar på attest" : ATTEST_LABEL[status]}</span>
        {s.actual_start && s.actual_end && ` · ${fmtTime(s.actual_start)}–${fmtTime(s.actual_end)}${s.break_minutes ? `, rast ${s.break_minutes} min` : ""} · ${hours?.toLocaleString("sv-SE")} h`}
      </p>
      {status === "avvisad" && s.attest_comment && <p className="text-sm text-warn">{s.attest_comment}</p>}
      {editable && (
        <details open={status === "" || status === "avvisad"}>
          <summary className="cursor-pointer text-sm font-medium text-brand">{s.actual_start ? "Ändra tid" : "Rapportera tid"}</summary>
          <form action={reportTime.bind(null, token, s.id)} className="mt-2 grid gap-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="field"><span className="label">Datum</span><input className="input" type="date" name="date" required defaultValue={isoToDate(s.actual_start ?? s.starts_at)} /></label>
              <label className="field"><span className="label">Start</span><input className="input" type="time" name="from" step={300} required defaultValue={isoToLocal(s.actual_start ?? s.starts_at).slice(11)} /></label>
              <label className="field"><span className="label">Slut</span><input className="input" type="time" name="to" step={300} required defaultValue={isoToLocal(s.actual_end ?? s.ends_at).slice(11)} /></label>
              <label className="field"><span className="label">Rast (min)</span><input className="input" type="number" name="break" min={0} max={600} defaultValue={s.break_minutes ?? 0} /></label>
            </div>
            <input className="input" name="comment" defaultValue={s.report_comment ?? ""} placeholder="Kommentar (valfritt)" aria-label="Kommentar" />
            <div><button className="btn btn-primary" type="submit">{s.actual_start ? "Spara tiden" : "Rapportera"}</button></div>
          </form>
        </details>
      )}
    </div>
  );
}

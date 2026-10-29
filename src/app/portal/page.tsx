import { StaffDetailsForm, type StaffDetails } from "@/components/staff-details-form";
import { EventInfo, type StaffEventInfo } from "@/components/event-info";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime, isoToDate, isoToLocal, weekday } from "@/lib/datum";
import { ASSIGNMENT_LABEL, ATTEST_LABEL, shiftHours, workedHours, type AssignmentStatus, type AttestStatus } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";
import { PushToggle } from "@/components/push-toggle";
import { apply, removePush, reportTime, saveMyDetails, savePush, signOut, withdraw } from "./actions";

export const metadata: Metadata = {
  title: "Mina pass",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-icon.png", icon: "/icon-192.png" },
  appleWebApp: { capable: true, title: "FCC Personal", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#60272b" };

type PortalShift = {
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
  filled: number;
  my_status: AssignmentStatus | null;
  open: boolean;
  actual_start: string | null;
  actual_end: string | null;
  break_minutes: number | null;
  report_comment: string | null;
  attest_status: AttestStatus | null;
  attest_comment: string | null;
  locked: boolean;
};

const TABS = [
  { id: "mina", label: "Mina pass" },
  { id: "lediga", label: "Lediga pass" },
  { id: "tidigare", label: "Tidigare" },
  { id: "uppgifter", label: "Mina uppgifter" },
] as const;

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ flik?: string; fel?: string; sokt?: string; aterkallad?: string; rapporterad?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data }, { data: me }, { data: details }] = await Promise.all([
    supabase.rpc("portal_shifts"),
    supabase.rpc("my_details"),
    supabase.from("staff").select("name, staff_skills(staff_functions(name))").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const all = (data ?? []) as PortalShift[];
  const now = new Date().toISOString();
  const tab = TABS.some((t) => t.id === sp.flik) ? (sp.flik as (typeof TABS)[number]["id"]) : "mina";

  // Mina pass: kommande och pågående, plus avslutade som saknar eller fått tillbaka tidrapport.
  const needsReport = (s: PortalShift) => s.my_status === "tilldelad" && s.ends_at < now && !s.locked && (s.attest_status === "" || s.attest_status === "avvisad");
  const mine = all.filter((s) => s.my_status === "tilldelad" && (s.ends_at >= now || needsReport(s)));
  const available = all.filter((s) => s.ends_at >= now && s.my_status !== "tilldelad" && (s.open || s.my_status === "ansokt"));
  const past = all.filter((s) => s.my_status === "tilldelad" && s.ends_at < now && !needsReport(s)).reverse();
  const toReport = all.filter(needsReport).length;
  const list = tab === "mina" ? mine : tab === "lediga" ? available : tab === "tidigare" ? past : [];
  const applied = available.filter((s) => s.my_status === "ansokt").length;
  const skills = ((me?.staff_skills ?? []) as unknown as { staff_functions: { name: string } | null }[]).map((x) => x.staff_functions?.name).filter(Boolean);

  const byDay = new Map<string, PortalShift[]>();
  for (const s of list) byDay.set(isoToDate(s.starts_at), [...(byDay.get(isoToDate(s.starts_at)) ?? []), s]);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-brand text-white">
        <div className="mx-auto max-w-2xl px-4 pt-5 pb-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display font-semibold tracking-wide">FCC <span className="font-normal opacity-75">Personal</span></p>
            <div className="flex items-center gap-3 text-sm">
              <Link href="/konto" className="opacity-85 hover:underline">Konto</Link>
              <form action={signOut}><button className="opacity-85 hover:underline" type="submit">Logga ut</button></form>
            </div>
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Hej {(me?.name ?? profile.full_name ?? "").split(" ")[0] || "där"}!</h1>
            <p className="text-sm opacity-85">
              {mine.length ? `Du har ${mine.length} kommande pass.` : "Du har inga kommande pass."}
              {skills.length ? ` Dina funktioner: ${skills.join(", ")}.` : ""}
            </p>
          </div>
          <nav className="flex gap-1 -mb-4 overflow-x-auto" aria-label="Flikar">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={`/portal?flik=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`rounded-t-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap ${tab === t.id ? "bg-bg text-brand" : "text-white/85 hover:bg-white/10"}`}
              >
                {t.label}
                {t.id === "lediga" && available.length > 0 && <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">{available.length}</span>}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 grid gap-4">
        {!me && (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            Ditt konto är inte kopplat till personalregistret. Kontakta den som planerar personal.
          </p>
        )}
        {me && <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} save={savePush} remove={removePush} />}
        {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
        {sp.sokt && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Du har sökt passet. Du får besked när det är bemannat.</p>}
        {sp.aterkallad && <p className="rounded-lg bg-sunk px-4 py-3 text-sm">Din ansökan är tillbakadragen.</p>}
        {sp.rapporterad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Tiden är rapporterad och väntar på attest.</p>}
        {tab === "mina" && toReport > 0 && <p className="rounded-lg bg-st-preliminar-soft px-4 py-3 text-sm text-st-preliminar">Du har {toReport} pass att rapportera tid för.</p>}
        {tab === "lediga" && applied > 0 && <p className="text-sm text-muted">Du har sökt {applied} pass som väntar på besked.</p>}

        {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Dina uppgifter är sparade.</p>}
        {tab === "uppgifter" ? (
          details ? (
            <section className="card p-5 grid gap-3">
              <p className="text-sm text-muted">Uppgifterna används för lön, kontakt och om något händer under ett pass.</p>
              <StaffDetailsForm d={details as StaffDetails} action={saveMyDetails} />
            </section>
          ) : (
            <div className="card p-8 text-center text-muted">Ditt konto är inte kopplat till personalregistret ännu.</div>
          )
        ) : list.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            {tab === "mina" ? "Inga kommande pass. Titta under Lediga pass." : tab === "lediga" ? "Inga lediga pass just nu i dina funktioner." : "Inga tidigare pass."}
          </div>
        ) : (
          [...byDay].map(([date, shifts]) => (
            <section key={date} className="grid gap-2">
              <h2 className={`font-display font-semibold ${weekday(date) >= 5 ? "text-brand" : ""}`}>{fmtDate(date)}</h2>
              {shifts.map((s) => {
                const full = s.filled >= s.needed;
                return (
                  <article key={s.id} id={`pass-${s.id}`} className="card p-4 grid gap-2 border-l-4 scroll-mt-4" style={{ borderLeftColor: s.color }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{s.function}{s.title ? ` · ${s.title}` : ""}</p>
                      <p className="tabular-nums font-medium">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)} <span className="text-sm text-muted">({shiftHours(s).toLocaleString("sv-SE")} h)</span></p>
                    </div>
                    {(s.event || s.room) && <p className="text-sm text-muted">{[s.event, s.room].filter(Boolean).join(" · ")}</p>}
                    {s.note && <p className="text-sm">{s.note}</p>}
                    {s.event_info && <EventInfo info={s.event_info} docHref={(id) => `/portal/fil/${id}`} />}
                    {s.my_status === "tilldelad" && <TimeReport s={s} tab={tab} now={now} />}
                    {tab === "lediga" && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {s.my_status === "ansokt" ? (
                          <>
                            <span className="rounded-full bg-st-preliminar-soft text-st-preliminar px-2.5 py-0.5 text-sm font-medium">{ASSIGNMENT_LABEL.ansokt}</span>
                            <form action={withdraw.bind(null, s.id, tab)}><button className="btn btn-ghost text-sm" type="submit">Dra tillbaka</button></form>
                          </>
                        ) : s.my_status === "nekad" ? (
                          <span className="text-sm text-muted">Du fick inte det här passet.</span>
                        ) : (
                          <form action={apply.bind(null, s.id, tab)}><button className="btn btn-primary" type="submit">Sök passet</button></form>
                        )}
                        <span className={`ml-auto text-sm ${full ? "text-muted" : "text-ok"}`}>{full ? "Fullt, du kan stå som reserv" : `${s.needed - s.filled} plats${s.needed - s.filled === 1 ? "" : "er"} kvar`}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))
        )}
      </main>
    </div>
  );
}

/** Tidrapport på ett eget pass: formulär när passet har börjat, annars status. */
function TimeReport({ s, tab, now }: { s: PortalShift; tab: string; now: string }) {
  const started = new Date(s.starts_at).getTime() - 2 * 3_600_000 <= new Date(now).getTime();
  if (!started) return null;
  const status = (s.attest_status ?? "") as AttestStatus;
  const hours = workedHours({ actual_start: s.actual_start, actual_end: s.actual_end, break_minutes: s.break_minutes });
  const editable = !s.locked && status !== "attesterad";
  const chip =
    status === "attesterad" ? "bg-st-genomford-soft text-ok" : status === "rapporterad" ? "bg-st-preliminar-soft text-st-preliminar" : status === "avvisad" ? "bg-warn-soft text-warn" : "bg-sunk text-muted";
  return (
    <div className="grid gap-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{status === "rapporterad" ? "Väntar på attest" : ATTEST_LABEL[status]}</span>
        {s.actual_start && s.actual_end && (
          <span className="tabular-nums">
            {fmtTime(s.actual_start)}–{fmtTime(s.actual_end)}
            {s.break_minutes ? `, rast ${s.break_minutes} min` : ""} · {hours?.toLocaleString("sv-SE")} h
          </span>
        )}
      </div>
      {status === "avvisad" && s.attest_comment && <p className="text-sm text-warn">{s.attest_comment}</p>}
      {editable && (
        <details open={status === "" || status === "avvisad"}>
          <summary className="cursor-pointer text-sm font-medium text-brand">{s.actual_start ? "Ändra tid" : "Rapportera tid"}</summary>
          <form action={reportTime.bind(null, s.id, tab)} className="mt-2 grid gap-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="field"><span className="label">Datum</span><input className="input" type="date" name="date" required defaultValue={isoToDate(s.actual_start ?? s.starts_at)} /></label>
              <label className="field"><span className="label">Start</span><input className="input" type="time" name="from" step={300} required defaultValue={isoToLocal(s.actual_start ?? s.starts_at).slice(11)} /></label>
              <label className="field"><span className="label">Slut</span><input className="input" type="time" name="to" step={300} required defaultValue={isoToLocal(s.actual_end ?? s.ends_at).slice(11)} /></label>
              <label className="field"><span className="label">Rast (min)</span><input className="input" type="number" name="break" min={0} max={600} defaultValue={s.break_minutes ?? 0} /></label>
            </div>
            <input className="input" name="comment" defaultValue={s.report_comment ?? ""} placeholder="Kommentar (valfritt), t.ex. varför tiden avviker" aria-label="Kommentar" />
            <div><button className="btn btn-primary" type="submit">{s.actual_start ? "Spara tiden" : "Rapportera"}</button></div>
          </form>
        </details>
      )}
    </div>
  );
}


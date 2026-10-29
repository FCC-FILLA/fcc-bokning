import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime, isoToDate, weekday } from "@/lib/datum";
import { ASSIGNMENT_LABEL, shiftHours, type AssignmentStatus } from "@/lib/personal";
import { createClient } from "@/lib/supabase/server";
import { apply, signOut, withdraw } from "./actions";

export const metadata = { title: "Mina pass" };

type PortalShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  function: string;
  color: string;
  title: string | null;
  note: string | null;
  event: string | null;
  room: string | null;
  needed: number;
  filled: number;
  my_status: AssignmentStatus | null;
  open: boolean;
};

const TABS = [
  { id: "mina", label: "Mina pass" },
  { id: "lediga", label: "Lediga pass" },
  { id: "tidigare", label: "Tidigare" },
] as const;

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ flik?: string; fel?: string; sokt?: string; aterkallad?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data }, { data: me }] = await Promise.all([
    supabase.rpc("portal_shifts"),
    supabase.from("staff").select("name, staff_skills(staff_functions(name))").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const all = (data ?? []) as PortalShift[];
  const now = new Date().toISOString();
  const tab = TABS.some((t) => t.id === sp.flik) ? (sp.flik as (typeof TABS)[number]["id"]) : "mina";

  const mine = all.filter((s) => s.my_status === "tilldelad" && s.ends_at >= now);
  const available = all.filter((s) => s.ends_at >= now && s.my_status !== "tilldelad" && (s.open || s.my_status === "ansokt"));
  const past = all.filter((s) => s.my_status === "tilldelad" && s.ends_at < now).reverse();
  const list = tab === "mina" ? mine : tab === "lediga" ? available : past;
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
        {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
        {sp.sokt && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Du har sökt passet. Du får besked när det är bemannat.</p>}
        {sp.aterkallad && <p className="rounded-lg bg-sunk px-4 py-3 text-sm">Din ansökan är tillbakadragen.</p>}
        {tab === "lediga" && applied > 0 && <p className="text-sm text-muted">Du har sökt {applied} pass som väntar på besked.</p>}

        {list.length === 0 ? (
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
                  <article key={s.id} className="card p-4 grid gap-2 border-l-4" style={{ borderLeftColor: s.color }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{s.function}{s.title ? ` · ${s.title}` : ""}</p>
                      <p className="tabular-nums font-medium">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)} <span className="text-sm text-muted">({shiftHours(s).toLocaleString("sv-SE")} h)</span></p>
                    </div>
                    {(s.event || s.room) && <p className="text-sm text-muted">{[s.event, s.room].filter(Boolean).join(" · ")}</p>}
                    {s.note && <p className="text-sm">{s.note}</p>}
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

import { loadOptionPlaces, optionOrdinal } from "@/lib/bokning";
import Link from "next/link";
import { NO_TYPE, hiddenTypes, loadEventTypes } from "@/lib/typer";
import { TypeFilter } from "@/components/type-filter";
import { canBook, getProfile } from "@/lib/auth";
import { addDays, dayStartIso, fmtTime, isoToDate, isoWeek, mondayOf, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type EventStatus } from "@/lib/types";

export const metadata = { title: "Månad" };

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

type Row = {
  starts_at: string;
  ends_at: string;
  event_id: string;
  room_id: string;
  events: { title: string; status: EventStatus; event_type_id: string | null };
};

type DayEvent = { id: string; title: string; status: EventStatus; start: string; rooms: number; type: string | null };

function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MonthPage({ searchParams }: { searchParams: Promise<{ m?: string; avbokade?: string; personal?: string; dolj?: string }> }) {
  const sp = await searchParams;
  const today = todayDate();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const showCancelled = sp.avbokade === "1";
  const showStaff = sp.personal === "1";
  const first = `${ym}-01`;
  const gridStart = mondayOf(first);
  const nextMonthFirst = `${shiftMonth(ym, 1)}-01`;
  const gridEnd = addDays(mondayOf(addDays(nextMonthFirst, -1)), 7);
  const days: string[] = [];
  for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push(d);

  const supabase = await createClient();
  const profile = await getProfile();
  const { data } = await supabase
    .from("bookings")
    .select("starts_at, ends_at, event_id, room_id, events!inner(title, status, event_type_id)")
    .lt("starts_at", dayStartIso(gridEnd))
    .gt("ends_at", dayStartIso(gridStart))
    .order("starts_at");
  const hidden = hiddenTypes(sp.dolj);
  const types = await loadEventTypes(supabase);
  const typeColor = new Map(types.map((t) => [t.id, t.color]));
  // Offererade lokaler som inte är bokade: en rad per offert och dag.
  const { data: offerData } = await supabase
    .from("quote_rooms")
    .select("starts_at, quote_id, quotes!inner(number, title, status)")
    .in("quotes.status", ["utkast", "skickad"])
    .lt("starts_at", dayStartIso(gridEnd))
    .gte("starts_at", dayStartIso(gridStart));
  const offersPerDay = new Map<string, Map<string, { id: string; label: string; start: string }>>();
  for (const o of (offerData ?? []) as unknown as { starts_at: string; quote_id: string; quotes: { number: number; title: string } }[]) {
    const d = isoToDate(o.starts_at);
    const m = offersPerDay.get(d) ?? new Map();
    if (!m.has(o.quote_id)) m.set(o.quote_id, { id: o.quote_id, label: `Offert ${o.quotes.number}: ${o.quotes.title}`, start: fmtTime(o.starts_at) });
    offersPerDay.set(d, m);
  }
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (showCancelled || r.events.status !== "avbokad") && !hidden.has(r.events.event_type_id ?? NO_TYPE));
  const optionPlace = await loadOptionPlaces(supabase, rows.filter((r) => r.events.status === "forfragan" || r.events.status === "preliminar").map((r) => r.event_id));

  // Personal per dag: tillsatta av behövda platser.
  const staffPerDay = new Map<string, { filled: number; needed: number; shifts: number }>();
  if (showStaff) {
    const { data: sh } = await supabase
      .from("shifts")
      .select("starts_at, needed, shift_assignments(status)")
      .lt("starts_at", dayStartIso(gridEnd))
      .gte("starts_at", dayStartIso(gridStart))
      .neq("status", "utkast");
    for (const x of (sh ?? []) as { starts_at: string; needed: number; shift_assignments: { status: string }[] }[]) {
      const d = isoToDate(x.starts_at);
      const cur = staffPerDay.get(d) ?? { filled: 0, needed: 0, shifts: 0 };
      cur.needed += x.needed;
      cur.filled += Math.min(x.needed, x.shift_assignments.filter((a) => a.status === "tilldelad").length);
      cur.shifts++;
      staffPerDay.set(d, cur);
    }
  }

  // Ett evenemang per dag, med tidigaste starttid och antal lokaler den dagen.
  const perDay = new Map<string, Map<string, DayEvent>>();
  for (const r of rows) {
    for (let d = isoToDate(r.starts_at); d <= isoToDate(r.ends_at) && d < gridEnd; d = addDays(d, 1)) {
      if (d < gridStart) continue;
      if (d !== isoToDate(r.starts_at) && r.ends_at <= dayStartIso(d)) continue;
      const m = perDay.get(d) ?? new Map<string, DayEvent>();
      const ev = m.get(r.event_id);
      const start = d === isoToDate(r.starts_at) ? fmtTime(r.starts_at) : "←";
      if (!ev) m.set(r.event_id, { id: r.event_id, title: r.events.title, status: r.events.status, start, rooms: 1, type: r.events.event_type_id });
      else {
        ev.rooms++;
        if (start < ev.start) ev.start = start;
      }
      perDay.set(d, m);
    }
  }

  const [y, mo] = ym.split("-").map(Number);
  const q = (m: string, o: { avbokade?: boolean; personal?: boolean; dolj?: string } = {}) => {
    const dolj = o.dolj ?? sp.dolj ?? "";
    return `/manad?m=${m}${(o.avbokade ?? showCancelled) ? "&avbokade=1" : ""}${(o.personal ?? showStaff) ? "&personal=1" : ""}${dolj ? `&dolj=${dolj}` : ""}`;
  };
  const MAX = 4;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link className="btn" href={q(shiftMonth(ym, -1))} aria-label="Föregående månad">←</Link>
        <Link className="btn" href={q(today.slice(0, 7))}>Idag</Link>
        <Link className="btn" href={q(shiftMonth(ym, 1))} aria-label="Nästa månad">→</Link>
        <h1 className="text-2xl font-semibold capitalize">{MONTHS[mo - 1]} {y}</h1>
        <span className="flex-1" />
        <Link className="text-sm text-muted underline-offset-2 hover:underline" href={q(ym, { avbokade: !showCancelled })}>
          {showCancelled ? "Dölj avbokade" : "Visa avbokade"}
        </Link>
        <Link className={`btn ${showStaff ? "btn-primary" : ""}`} href={q(ym, { personal: !showStaff })} aria-pressed={showStaff}>
          {showStaff ? "Dölj personal" : "Visa personal"}
        </Link>
        <Link className="btn" href={`/vecka?vecka=${mondayOf(ym === today.slice(0, 7) ? today : first)}${showStaff ? "&personal=1" : ""}${sp.dolj ? `&dolj=${sp.dolj}` : ""}`}>Veckovy</Link>
        {canBook(profile) && <Link className="btn btn-primary" href="/evenemang/ny">Nytt evenemang</Link>}
      </div>

      <TypeFilter types={types} hidden={hidden} href={(dolj) => q(ym, { dolj })} />

      <div className="card overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-[44px_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-line" />
          {DAYS.map((d) => (
            <div key={d} className="label px-2 py-2 border-b border-l border-line">{d}</div>
          ))}
          {days.map((d, i) => {
            const inMonth = d.slice(0, 7) === ym;
            const list = [...(perDay.get(d)?.values() ?? [])].sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div key={d} className="contents">
                {i % 7 === 0 && (
                  <Link
                    href={`/vecka?vecka=${d}`}
                    className="border-b border-line px-1 py-2 text-center text-xs text-muted font-mono hover:text-brand"
                    title="Öppna veckan"
                  >
                    v{isoWeek(d)}
                  </Link>
                )}
                <div
                  className={`min-h-28 border-b border-l border-line p-1.5 grid content-start gap-1 ${
                    d === today ? "bg-today" : inMonth ? "" : "bg-sunk/60"
                  }`}
                >
                  <Link
                    href={`/vecka?vecka=${mondayOf(d)}`}
                    className={`justify-self-start text-sm font-display font-semibold px-1 rounded hover:bg-sunk ${
                      d === today ? "text-brand" : inMonth ? "" : "text-muted"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  {list.slice(0, MAX).map((e) => (
                    <Link
                      key={e.id}
                      href={`/evenemang/${e.id}`}
                      title={`${e.title} · ${STATUS_LABEL[e.status]}${optionPlace.has(e.id) ? ` · ${optionOrdinal(optionPlace.get(e.id)!)} option` : ""} · ${e.rooms} lokal${e.rooms === 1 ? "" : "er"}`}
                      className={`block truncate rounded border-l-[3px] px-1.5 py-0.5 text-xs font-semibold st-${e.status} ${
                        e.status === "preliminar" ? "border-dashed" : ""
                      }`}
                      style={e.type && typeColor.has(e.type) ? { borderLeftColor: typeColor.get(e.type) } : undefined}
                    >
                      <span className="font-mono font-normal opacity-80">{e.start}</span>{" "}
                      {optionPlace.has(e.id) && <span className="rounded bg-white/70 px-1 font-mono text-[10px]">{optionOrdinal(optionPlace.get(e.id)!)}</span>} {e.title}
                    </Link>
                  ))}
                  {staffPerDay.get(d) && (() => {
                    const st = staffPerDay.get(d)!;
                    const full = st.filled >= st.needed;
                    return (
                      <Link
                        href={`/personal?fran=${d}&dagar=7`}
                        title={`${st.shifts} pass · ${st.filled} av ${st.needed} platser tillsatta`}
                        className={`flex justify-between rounded px-1.5 py-0.5 text-[11px] ${full ? "bg-sunk text-muted" : "bg-st-preliminar-soft text-st-preliminar"}`}
                      >
                        <span>Personal</span>
                        <span className="font-semibold tabular-nums">{st.filled}/{st.needed}</span>
                      </Link>
                    );
                  })()}
                  {[...(offersPerDay.get(d)?.values() ?? [])].map((o) => (
                    <Link key={o.id} href={`/offerter/${o.id}#lokaler`} className="block truncate rounded border border-dashed border-brand/60 bg-brand-soft/40 px-1.5 py-0.5 text-xs text-brand" title={`${o.label} · offererat, inte bokat`}>
                      <span className="font-mono opacity-80">{o.start}</span> {o.label}
                    </Link>
                  ))}
                  {list.length > MAX && (
                    <Link href={`/vecka?vecka=${mondayOf(d)}`} className="text-xs text-muted hover:underline px-1">
                      +{list.length - MAX} till
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

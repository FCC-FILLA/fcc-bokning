import Link from "next/link";
import { canBook, canManageStaff, requireProfile } from "@/lib/auth";
import { loadEventTypes } from "@/lib/typer";
import {
  addDays, dayShort, dayStartIso, fmtDate, fmtDayMonth, fmtMinutes, fmtTime, isoToDate, todayDate,
} from "@/lib/datum";
import { QUOTE_STATUS_LABEL, fmtKr } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type BookingConflict, type EventStatus, type QuoteOverview, type Room } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

export const metadata = { title: "Översikt" };

type BookingRow = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  event_id: string;
  events: { title: string; status: EventStatus; company_id: string | null; event_type_id: string | null };
};

const ACTIVE: EventStatus[] = ["forfragan", "preliminar", "bekraftad"];
const DAYS_AHEAD = 14;

/** Tidpunkter som sidan jämför mot, räknade en gång per sidladdning. */
function timeRefs() {
  const now = Date.now();
  return {
    nowIso: new Date(now).toISOString(),
    monthAgo: new Date(now - 30 * 864e5).toISOString(),
    weekAgo: new Date(now - 7 * 864e5).toISOString(),
  };
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("sv-SE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Stockholm" }).format(new Date()));
  return h < 10 ? "God morgon" : h < 17 ? "Hej" : "God kväll";
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const horizon = addDays(today, DAYS_AHEAD);
  const { nowIso, monthAgo, weekAgo } = timeRefs();
  const soon = addDays(today, 7);

  const [
    { data: roomData },
    { data: bookingData },
    { data: conflictData },
    { data: optionData },
    { data: sentData },
    { data: acceptedData },
    { data: recentEvents },
    { data: recentQuotes },
    { data: inquiryData },
  ] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).eq("bookable", true).order("sort_order"),
    supabase
      .from("bookings")
      .select("id, room_id, starts_at, ends_at, event_id, events!inner(title, status, company_id, event_type_id)")
      .in("events.status", ACTIVE)
      .lt("starts_at", dayStartIso(horizon))
      .gt("ends_at", dayStartIso(today))
      .order("starts_at"),
    supabase.from("booking_conflicts").select("*").gte("ends_at", nowIso).order("starts_at").limit(40),
    supabase
      .from("events")
      .select("id, title, option_expires_on")
      .eq("status", "preliminar")
      .not("option_expires_on", "is", null)
      .lte("option_expires_on", soon)
      .order("option_expires_on"),
    supabase.from("quote_overview").select("*").eq("status", "skickad").order("valid_until", { ascending: true, nullsFirst: false }),
    supabase.from("quote_overview").select("*").eq("status", "accepterad").gte("accepted_at", monthAgo).order("accepted_at", { ascending: false }),
    supabase.from("event_overview").select("id, title, status, updated_at, company_name").order("updated_at", { ascending: false }).limit(5),
    supabase.from("quote_overview").select("id, number, title, status, updated_at, company_name").order("updated_at", { ascending: false }).limit(5),
    supabase.from("event_overview").select("id, title, created_at, company_name, starts_at").eq("status", "forfragan").order("created_at").limit(50),
  ]);

  const [types, { data: noteData }] = await Promise.all([
    loadEventTypes(supabase),
    supabase.from("notifications").select("id, title, body, link, created_at, read_at").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(6),
  ]);
  const typeColor = new Map(types.map((t) => [t.id, t.color]));
  const latestNotes = (noteData ?? []) as { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }[];
  const rooms = (roomData ?? []) as Room[];
  const bookings = (bookingData ?? []) as unknown as BookingRow[];
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  // Idag och i morgon: ett kort per evenemang med lokaler och tider.
  const dayEvents = (d: string) => {
    const start = dayStartIso(d);
    const end = dayStartIso(addDays(d, 1));
    const map = new Map<string, { id: string; title: string; status: EventStatus; slots: BookingRow[] }>();
    for (const b of bookings) {
      if (!(b.starts_at < end && b.ends_at > start)) continue;
      const e = map.get(b.event_id) ?? { id: b.event_id, title: b.events.title, status: b.events.status, slots: [] };
      e.slots.push(b);
      map.set(b.event_id, e);
    }
    return [...map.values()].sort((a, b) => a.slots[0].starts_at.localeCompare(b.slots[0].starts_at));
  };
  const todayEvents = dayEvents(today);
  const tomorrowEvents = dayEvents(tomorrow);

  // Krockar: en rad per par.
  const seen = new Set<string>();
  const conflicts = ((conflictData ?? []) as BookingConflict[]).filter((c) => {
    const key = [c.booking_id, c.other_booking_id].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const options = (optionData ?? []) as { id: string; title: string; option_expires_on: string }[];
  const sent = (sentData ?? []) as QuoteOverview[];
  const expiredSent = sent.filter((q) => q.valid_until && q.valid_until < today);
  const waiting = sent.filter((q) => !(q.valid_until && q.valid_until < today));
  const accepted = (acceptedData ?? []) as QuoteOverview[];
  const oldInquiries = ((inquiryData ?? []) as { id: string; title: string; created_at: string; company_name: string | null }[]).filter(
    (e) => e.created_at < weekAgo,
  );
  // Kommande pass (två veckor) där inte alla platser är tillsatta.
  const { data: shiftData } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at, needed, staff_kind, staff_functions(name, color), events(id, title), shift_assignments(status)")
    .neq("status", "utkast")
    .gt("ends_at", nowIso)
    .lt("starts_at", dayStartIso(horizon))
    .order("starts_at");
  type GapShift = {
    id: string; starts_at: string; ends_at: string; needed: number; staff_kind: string;
    staff_functions: { name: string; color: string } | null; events: { id: string; title: string } | null;
    shift_assignments: { status: string }[];
  };
  const understaffed = ((shiftData ?? []) as unknown as GapShift[])
    .map((x) => ({ ...x, filled: x.shift_assignments.filter((a) => a.status === "tilldelad").length, pending: x.shift_assignments.filter((a) => a.status === "inbjuden" || a.status === "ansokt").length }))
    .filter((x) => x.filled < x.needed);
  const missingPeople = understaffed.reduce((n, x) => n + x.needed - x.filled, 0);
  // För kort omställning och möbler som inte räcker de närmaste 30 dagarna.
  const [{ data: coData }, { data: furnData }, { data: issueData }] = await Promise.all([
    supabase.from("changeover_warnings").select("booking_id, next_booking_id, event_id, event_title, next_event_id, next_event_title, room_name, ends_at, gap_minutes, needed_minutes").gte("next_starts_at", nowIso).lt("next_starts_at", dayStartIso(addDays(today, 30))).order("ends_at").limit(20),
    supabase.rpc("furniture_by_day", { p_from: today, p_to: addDays(today, 30) }),
    supabase.from("room_issues").select("id, title, created_at, rooms(name)").eq("status", "ny").order("created_at", { ascending: false }).limit(10),
  ]);
  const newIssues = (issueData ?? []) as unknown as { id: string; title: string; created_at: string; rooms: { name: string } | null }[];
  const shortChanges = (coData ?? []) as { booking_id: string; next_booking_id: string; event_id: string; event_title: string; next_event_id: string; next_event_title: string; room_name: string; ends_at: string; gap_minutes: number; needed_minutes: number }[];
  const shortages = ((furnData ?? []) as { day: string; furniture_id: string; name: string; needed: number; stock: number | null }[]).filter((x) => x.stock != null && x.needed > x.stock);
  const actionCount = conflicts.length + options.length + expiredSent.length + oldInquiries.length + understaffed.length + shortChanges.length + shortages.length + newIssues.length;

  // Kommande veckan: ett evenemang per dag med tider och lokaler.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const weekByDay = new Map<string, { id: string; title: string; status: EventStatus; color: string; from: string; to: string; rooms: string[] }[]>();
  for (const d of weekDays) {
    const list = dayEvents(d).map((e) => {
      const start = dayStartIso(d);
      const end = dayStartIso(addDays(d, 1));
      const from = e.slots.map((b) => (b.starts_at < start ? "00:00" : fmtTime(b.starts_at))).sort()[0];
      const to = e.slots.map((b) => (b.ends_at > end ? "24:00" : fmtTime(b.ends_at))).sort().at(-1)!;
      const type = e.slots[0].events.event_type_id;
      return { id: e.id, title: e.title, status: e.status, from, to, rooms: [...new Set(e.slots.map((b) => roomName.get(b.room_id) ?? ""))].filter(Boolean), color: (type && typeColor.get(type)) || "var(--color-line)" };
    });
    if (list.length) weekByDay.set(d, list);
  }
  const weekEvents = [...new Set([...weekByDay.values()].flat().map((e) => e.id))];

  const sumSent = waiting.reduce((s, q) => s + Number(q.total_ex_vat), 0);
  const sumAccepted = accepted.reduce((s, q) => s + Number(q.total_ex_vat), 0);
  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="label">{dayShort(today)} {fmtDayMonth(today)} {today.slice(0, 4)}</p>
          <h1 className="text-3xl font-semibold">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <span className="flex-1" />
        {canBook(profile) && (
          <>
            <Link className="btn" href="/ledigt">Hitta ledig lokal</Link>
            <Link className="btn" href="/offerter/ny">Ny offert</Link>
            <Link className="btn btn-primary" href="/evenemang/ny">Nytt evenemang</Link>
          </>
        )}
        {canManageStaff(profile) && <Link className="btn" href="/personal?nytt=1#nytt-pass">Nytt arbetspass</Link>}
      </div>

      {/* Nyckeltal */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat href="/vecka" label="Evenemang idag" value={String(todayEvents.length)} sub={`${tomorrowEvents.length} i morgon`} />
        <Stat
          href="#att-gora"
          label="Kräver åtgärd"
          value={String(actionCount)}
          sub={actionCount ? "Se listan nedan" : "Allt ser bra ut"}
          tone={actionCount ? "warn" : "ok"}
        />
        <Stat href="/offerter?status=skickad" label="Offerter som väntar svar" value={fmtKr(sumSent)} sub={`${waiting.length} st, exkl. moms`} />
        <Stat href="/offerter?status=accepterad" label="Accepterat senaste 30 dagarna" value={fmtKr(sumAccepted)} sub={`${accepted.length} st, exkl. moms`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        {/* Idag / i morgon */}
        <section className="card p-5 grid gap-4">
          {[
            { label: "Idag", d: today, list: todayEvents },
            { label: "I morgon", d: tomorrow, list: tomorrowEvents },
          ].map((block) => (
            <div key={block.d} className="grid gap-2">
              <div className="flex items-baseline gap-3 border-b border-line pb-1">
                <h2 className="text-lg font-semibold">{block.label}</h2>
                <span className="text-sm text-muted">{dayShort(block.d)} {fmtDayMonth(block.d)}</span>
                <span className="flex-1" />
                <Link className="text-sm text-muted hover:underline" href={`/dagsblad?datum=${block.d}`}>Dagsblad</Link>
              </div>
              {block.list.length === 0 ? (
                <p className="text-sm text-muted">Inga bokningar.</p>
              ) : (
                <ul className="grid gap-2">
                  {block.list.map((e) => (
                    <li key={e.id} className={`rounded-md border-l-[3px] px-3 py-2 st-${e.status} ${e.status === "preliminar" ? "border-dashed" : ""}`}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link href={`/evenemang/${e.id}`} className="font-semibold hover:underline underline-offset-2">{e.title}</Link>
                        {e.status !== "bekraftad" && <span className="text-xs">{STATUS_LABEL[e.status]}</span>}
                      </div>
                      <p className="text-sm text-fg/80">
                        {e.slots
                          .map((s) => {
                            const startsToday = isoToDate(s.starts_at) === block.d;
                            const endsToday = isoToDate(s.ends_at) === block.d;
                            return `${roomName.get(s.room_id) ?? "?"} ${startsToday ? fmtTime(s.starts_at) : "←"}–${endsToday ? fmtTime(s.ends_at) : "→"}`;
                          })
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        {/* Att göra */}
        <section id="att-gora" className="card p-5 grid gap-4 scroll-mt-20">
          <h2 className="text-lg font-semibold">Kräver åtgärd</h2>
          {actionCount === 0 && <p className="text-sm text-muted">Inga krockar, utgående optioner, obesvarade förfrågningar eller pass utan personal.</p>}

          {conflicts.length > 0 && (
            <Todo title={`Krockar (${conflicts.length})`} href="/krockar">
              {conflicts.slice(0, 4).map((c) => (
                <li key={c.booking_id + c.other_booking_id}>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.event_id}`}>{c.event_title}</Link>
                  {" och "}
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.other_event_id}`}>{c.other_event_title}</Link>
                  <span className="block text-muted">{c.room_name} / {c.other_room_name}, {fmtDate(c.starts_at)}</span>
                </li>
              ))}
            </Todo>
          )}

          {newIssues.length > 0 && (
            <Todo title={`Nya felanmälningar (${newIssues.length})`} href="/fastighet/fel">
              {newIssues.slice(0, 4).map((x) => (
                <li key={x.id}>
                  <Link className="font-semibold hover:underline" href={`/fastighet/fel#${x.id}`}>{x.title}</Link>
                  <span className="block text-muted">{x.rooms?.name}, {fmtDate(x.created_at)}</span>
                </li>
              ))}
            </Todo>
          )}

          {shortChanges.length > 0 && (
            <Todo title={`För kort omställning (${shortChanges.length})`} href="/krockar#omstallning">
              {shortChanges.slice(0, 4).map((c) => (
                <li key={c.booking_id + c.next_booking_id}>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.event_id}`}>{c.event_title}</Link>
                  {" → "}
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.next_event_id}`}>{c.next_event_title}</Link>
                  <span className="block text-muted">{c.room_name}, {fmtDate(c.ends_at)}: {fmtMinutes(c.gap_minutes)} emellan, behövs {fmtMinutes(c.needed_minutes)}</span>
                </li>
              ))}
            </Todo>
          )}

          {shortages.length > 0 && (
            <Todo title={`Möbler som inte räcker (${shortages.length})`} href="/mobleringar/lager">
              {shortages.slice(0, 4).map((x) => (
                <li key={x.day + x.furniture_id}>
                  <span className="font-semibold">{x.name}</span> {fmtDate(x.day)}
                  <span className="block text-warn">Ritningarna kräver {x.needed}, ni har {x.stock}</span>
                </li>
              ))}
            </Todo>
          )}

          {understaffed.length > 0 && (
            <Todo title={`Pass som saknar personal (${understaffed.length} pass, ${missingPeople} ${missingPeople === 1 ? "person" : "personer"})`} href="/personal">
              {understaffed.slice(0, 6).map((x) => (
                <li key={x.id} className="border-l-4 pl-2" style={{ borderLeftColor: x.staff_functions?.color ?? "var(--color-line)" }}>
                  <Link className="font-semibold hover:underline" href={`/personal/pass/${x.id}`}>
                    {x.staff_functions?.name ?? "Pass"} · {fmtDate(x.starts_at)} {fmtTime(x.starts_at)}–{fmtTime(x.ends_at)}
                  </Link>
                  <span className="block text-muted">
                    {x.filled} av {x.needed} tillsatta{x.pending ? `, ${x.pending} väntar på svar` : ""}{x.events ? ` · ${x.events.title}` : ""}
                  </span>
                </li>
              ))}
            </Todo>
          )}

          {options.length > 0 && (
            <Todo title="Optioner som går ut inom en vecka">
              {options.map((o) => (
                <li key={o.id}>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${o.id}`}>{o.title}</Link>
                  <span className={`block ${o.option_expires_on < today ? "text-warn" : "text-muted"}`}>
                    {o.option_expires_on < today ? "Gick ut" : "Går ut"} {fmtDate(o.option_expires_on)}
                  </span>
                </li>
              ))}
            </Todo>
          )}

          {expiredSent.length > 0 && (
            <Todo title="Skickade offerter som passerat giltighetstiden" href="/offerter?status=skickad">
              {expiredSent.slice(0, 5).map((q) => (
                <li key={q.id}>
                  <Link className="font-semibold hover:underline" href={`/offerter/${q.id}`}>#{q.number} {q.title}</Link>
                  <span className="block text-muted">{q.company_name ?? "Ingen kund"}, gällde till {fmtDate(q.valid_until!)}</span>
                </li>
              ))}
            </Todo>
          )}

          {oldInquiries.length > 0 && (
            <Todo title="Förfrågningar äldre än en vecka" href="/evenemang?status=forfragan">
              {oldInquiries.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${e.id}`}>{e.title}</Link>
                  <span className="block text-muted">{e.company_name ?? "Ingen kund"}, inkom {fmtDate(e.created_at)}</span>
                </li>
              ))}
            </Todo>
          )}
        </section>
      </div>

      {/* Kommande veckan och senaste notiser */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <section className="card p-5 grid gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-semibold">Kommande veckan</h2>
            <span className="text-sm text-muted">{weekEvents.length} evenemang</span>
            <span className="flex-1" />
            <Link className="text-xs text-muted hover:underline" href="/vecka">Veckovyn</Link>
          </div>
          {weekEvents.length === 0 ? (
            <p className="text-sm text-muted">Inga evenemang de kommande sju dagarna.</p>
          ) : (
            <div className="grid gap-3">
              {weekDays.filter((d) => weekByDay.has(d)).map((d) => (
                <div key={d} className="grid gap-1">
                  <h3 className="font-display font-semibold text-sm border-b border-line pb-1">
                    {d === today ? "Idag" : d === tomorrow ? "I morgon" : `${dayShort(d)} ${fmtDayMonth(d)}`}
                  </h3>
                  <ul className="grid gap-1">
                    {weekByDay.get(d)!.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border-l-4 px-2 py-1 hover:bg-sunk/60" style={{ borderLeftColor: e.color }}>
                        <span className="font-mono text-xs w-24 shrink-0">{e.from}–{e.to}</span>
                        <Link className="font-semibold hover:underline min-w-0" href={`/evenemang/${e.id}`}>{e.title}</Link>
                        <span className="text-xs text-muted truncate">{e.rooms.join(", ")}</span>
                        <span className="flex-1" />
                        <StatusPill status={e.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5 grid gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">Senaste notiser</h2>
            <span className="flex-1" />
            <Link className="text-xs text-muted hover:underline" href="/notiser">Alla notiser</Link>
          </div>
          {latestNotes.length === 0 ? (
            <p className="text-sm text-muted">Inga notiser ännu. Här syns när kunder svarar på offerter och personal tackar ja eller nej.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {latestNotes.map((n) => (
                <li key={n.id} className="flex items-start gap-2">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-brand"}`} aria-hidden />
                  <span className="grid flex-1">
                    {n.link ? <Link className={`hover:underline ${n.read_at ? "" : "font-semibold"}`} href={n.link}>{n.title}</Link> : <span>{n.title}</span>}
                    {n.body && <span className="text-xs text-muted">{n.body}</span>}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">{fmtDate(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Offerter och senast ändrat */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className="card p-5 grid gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">Offerter som väntar på svar</h2>
            <span className="flex-1" />
            <Link className="text-sm text-muted hover:underline" href="/offerter">Alla offerter</Link>
          </div>
          {waiting.length === 0 ? (
            <p className="text-sm text-muted">Inga skickade offerter just nu.</p>
          ) : (
            <ul className="grid gap-2">
              {waiting.slice(0, 6).map((q) => (
                <li key={q.id} className="flex flex-wrap items-baseline gap-x-3">
                  <Link className="font-semibold hover:underline min-w-0" href={`/offerter/${q.id}`}>#{q.number} {q.title}</Link>
                  <span className="text-sm text-muted">{q.company_name}</span>
                  <span className="flex-1" />
                  <span className="text-sm tabular-nums">{fmtKr(Number(q.total_ex_vat))}</span>
                  {q.valid_until && <span className="text-xs text-muted w-full">Gäller till {fmtDate(q.valid_until)}</span>}
                </li>
              ))}
            </ul>
          )}
          {accepted.length > 0 && (
            <>
              <h3 className="font-semibold mt-2">Nyligen accepterade</h3>
              <ul className="grid gap-1">
                {accepted.slice(0, 4).map((q) => (
                  <li key={q.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <Link className="hover:underline" href={`/offerter/${q.id}`}>#{q.number} {q.title}</Link>
                    <span className="flex-1" />
                    <span className="tabular-nums text-ok">{fmtKr(Number(q.total_ex_vat))}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Senast ändrat</h2>
          <ul className="grid gap-2 text-sm">
            {[
              ...((recentEvents ?? []) as { id: string; title: string; status: EventStatus; updated_at: string; company_name: string | null }[]).map((e) => ({
                at: e.updated_at,
                node: (
                  <li key={`e${e.id}`} className="flex flex-wrap items-center gap-2">
                    <span className="label w-20">Evenemang</span>
                    <Link className="font-semibold hover:underline" href={`/evenemang/${e.id}`}>{e.title}</Link>
                    <StatusPill status={e.status} />
                    <span className="flex-1" />
                    <span className="text-xs text-muted">{fmtDate(e.updated_at)}</span>
                  </li>
                ),
              })),
              ...((recentQuotes ?? []) as { id: string; number: number; title: string; status: QuoteOverview["status"]; updated_at: string }[]).map((q) => ({
                at: q.updated_at,
                node: (
                  <li key={`q${q.id}`} className="flex flex-wrap items-center gap-2">
                    <span className="label w-20">Offert</span>
                    <Link className="font-semibold hover:underline" href={`/offerter/${q.id}`}>#{q.number} {q.title}</Link>
                    <span className={`pill q-${q.status}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
                    <span className="flex-1" />
                    <span className="text-xs text-muted">{fmtDate(q.updated_at)}</span>
                  </li>
                ),
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 8)
              .map((x) => x.node)}
          </ul>
          {!recentEvents?.length && !recentQuotes?.length && <p className="text-sm text-muted">Inget ännu.</p>}
        </section>
      </div>
    </div>
  );
}

function Stat({ href, label, value, sub, tone }: { href: string; label: string; value: string; sub: string; tone?: "warn" | "ok" }) {
  return (
    <Link href={href} className="card p-4 grid gap-1 hover:border-muted">
      <span className="label">{label}</span>
      <span className={`font-display text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : ""}`}>{value}</span>
      <span className="text-xs text-muted">{sub}</span>
    </Link>
  );
}

function Todo({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="flex-1" />
        {href && <Link className="text-xs text-muted hover:underline" href={href}>Visa alla</Link>}
      </div>
      <ul className="grid gap-2 text-sm border-l-2 border-warn/40 pl-3">{children}</ul>
    </div>
  );
}

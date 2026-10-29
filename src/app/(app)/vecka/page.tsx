import { loadOptionPlaces, optionOrdinal } from "@/lib/bokning";
import Link from "next/link";
import { NO_TYPE, hiddenTypes, loadEventTypes } from "@/lib/typer";
import { TypeFilter } from "@/components/type-filter";
import { canBook, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDays, dayShort, dayStartIso, fmtDayMonth, fmtTime, isoToDate, isoWeek, mondayOf, todayDate, weekday,
} from "@/lib/datum";
import { depthOf, makeOverlap } from "@/lib/lokaler";
import { STATUS_LABEL, type EventStatus, type Room } from "@/lib/types";

export const metadata = { title: "Vecka" };

type Row = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  event_id: string;
  events: { title: string; status: EventStatus; event_type_id: string | null };
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ vecka?: string; avbokade?: string; personal?: string; dolj?: string; offerter?: string }>;
}) {
  const sp = await searchParams;
  const today = todayDate();
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.vecka ?? "") ? sp.vecka! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const showCancelled = sp.avbokade === "1";
  const showStaff = sp.personal === "1";
  const showOffers = sp.offerter !== "0";

  const supabase = await createClient();
  const profile = await getProfile();
  const booker = canBook(profile);

  const hidden = hiddenTypes(sp.dolj);
  const [{ data: roomData }, { data: bookingData }, { data: shiftData }, types] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).eq("bookable", true).order("sort_order"),
    supabase
      .from("bookings")
      .select("id, room_id, starts_at, ends_at, event_id, events!inner(title, status, event_type_id)")
      .lt("starts_at", dayStartIso(addDays(monday, 7)))
      .gt("ends_at", dayStartIso(monday))
      .order("starts_at"),
    showStaff
      ? supabase
          .from("shifts")
          .select("id, starts_at, ends_at, needed, function_id, staff_functions(name, color, sort_order), events(title), shift_assignments(status)")
          .lt("starts_at", dayStartIso(addDays(monday, 7)))
          .gt("ends_at", dayStartIso(monday))
          .neq("status", "utkast")
          .order("starts_at")
      : Promise.resolve({ data: [] }),
    loadEventTypes(supabase),
  ]);
  // Offererade lokaler (utkast och skickade offerter) som ännu inte är bokade.
  const { data: offerData } = await supabase
    .from("quote_rooms")
    .select("id, room_id, starts_at, ends_at, quote_id, quotes!inner(number, title, status)")
    .in("quotes.status", ["utkast", "skickad"])
    .lt("starts_at", dayStartIso(addDays(monday, 7)))
    .gt("ends_at", dayStartIso(monday));
  type OfferRow = { id: string; room_id: string; starts_at: string; ends_at: string; quote_id: string; quotes: { number: number; title: string; status: string } };
  const offers = showOffers ? ((offerData ?? []) as unknown as OfferRow[]) : [];
  const typeColor = new Map(types.map((t) => [t.id, t.color]));

  const rooms = (roomData ?? []) as Room[];
  type ShiftRow = {
    id: string; starts_at: string; ends_at: string; needed: number; function_id: string;
    staff_functions: { name: string; color: string; sort_order: number } | null;
    events: { title: string } | null;
    shift_assignments: { status: string }[];
  };
  const shifts = (shiftData ?? []) as unknown as ShiftRow[];
  const staffRows = [...new Map(shifts.map((x) => [x.function_id, x.staff_functions])).entries()]
    .filter((x): x is [string, NonNullable<ShiftRow["staff_functions"]>] => !!x[1])
    .sort((a, b) => a[1].sort_order - b[1].sort_order);
  const all = (bookingData ?? []) as unknown as Row[];
  const active = all.filter((b) => ["forfragan", "preliminar", "bekraftad"].includes(b.events.status));
  const visible = all.filter((b) => (showCancelled || b.events.status !== "avbokad") && !hidden.has(b.events.event_type_id ?? NO_TYPE));
  const overlap = makeOverlap(rooms);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  // Bokningar som krockar med någon annan aktiv bokning. Två obekräftade på samma tid är optioner i kö, inte en krock.
  const clashing = new Set<string>();
  for (const a of active)
    for (const b of active)
      if (a.id !== b.id && a.starts_at < b.ends_at && b.starts_at < a.ends_at && overlap(a.room_id, b.room_id)
        && (a.events.status === "bekraftad" || b.events.status === "bekraftad"))
        clashing.add(a.id);
  const optionPlace = await loadOptionPlaces(supabase, active.filter((b) => b.events.status !== "bekraftad").map((b) => b.event_id));

  const inDay = (b: Row, d: string) => b.starts_at < dayStartIso(addDays(d, 1)) && b.ends_at > dayStartIso(d);
  const timeLabel = (b: Row, d: string) => {
    const s = isoToDate(b.starts_at) < d ? "←" : fmtTime(b.starts_at);
    const endDay = isoToDate(b.ends_at);
    const e = endDay > d ? (endDay === addDays(d, 1) && fmtTime(b.ends_at) === "00:00" ? "24" : "→") : fmtTime(b.ends_at);
    return `${s}–${e}`;
  };

  const q = (vecka: string, o: { avbokade?: boolean; personal?: boolean; dolj?: string; offerter?: boolean } = {}) => {
    const dolj = o.dolj ?? sp.dolj ?? "";
    return `/vecka?vecka=${vecka}${(o.avbokade ?? showCancelled) ? "&avbokade=1" : ""}${(o.personal ?? showStaff) ? "&personal=1" : ""}${dolj ? `&dolj=${dolj}` : ""}${(o.offerter ?? showOffers) ? "" : "&offerter=0"}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link className="btn" href={q(addDays(monday, -7))} aria-label="Föregående vecka">←</Link>
        <Link className="btn" href={q(mondayOf(today))}>Idag</Link>
        <Link className="btn" href={q(addDays(monday, 7))} aria-label="Nästa vecka">→</Link>
        <h1 className="text-2xl font-semibold">Vecka {isoWeek(monday)}</h1>
        <span className="text-sm text-muted font-mono">
          {fmtDayMonth(monday)} – {fmtDayMonth(days[6])} {days[6].slice(0, 4)}
        </span>
        <span className="flex-1" />
        <Link className="text-sm text-muted underline-offset-2 hover:underline" href={q(monday, { avbokade: !showCancelled })}>
          {showCancelled ? "Dölj avbokade" : "Visa avbokade"}
        </Link>
        <Link className="text-sm text-muted underline-offset-2 hover:underline" href={q(monday, { offerter: !showOffers })}>
          {showOffers ? "Dölj offerter" : "Visa offerter"}
        </Link>
        <Link className={`btn ${showStaff ? "btn-primary" : ""}`} href={q(monday, { personal: !showStaff })} aria-pressed={showStaff}>
          {showStaff ? "Dölj personal" : "Visa personal"}
        </Link>
        <Link className="btn" href={`/manad?m=${monday.slice(0, 7)}${showStaff ? "&personal=1" : ""}${sp.dolj ? `&dolj=${sp.dolj}` : ""}`}>Månadsvy</Link>
        {booker && <Link className="btn btn-primary" href="/evenemang/ny">Nytt evenemang</Link>}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        {(["forfragan", "preliminar", "bekraftad", "avbokad"] as EventStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm border st-${s}`} style={{ background: "currentColor" }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span>Randig ruta: lokalen blockeras av en bokning i hela salen eller en del av den.</span>
        <span className="text-warn">Röd ram: krock.</span>
        <span>Färgad kant: evenemangstyp.</span>
        <span className="text-brand">Streckad: offererat, inte bokat.</span>
      </div>
      <TypeFilter types={types} hidden={hidden} href={(dolj) => q(monday, { dolj })} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-[190px]" />
            {days.map((d) => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left label border-b border-line">Lokal</th>
              {days.map((d) => (
                <th key={d} className={`px-2 py-2 text-left border-b border-l border-line ${d === today ? "bg-today" : ""}`}>
                  <span className="label">{dayShort(d)}</span>
                  <span className={`block font-display text-base font-semibold ${d === today ? "text-brand" : ""}`}>
                    {fmtDayMonth(d)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room, i) => {
              const depth = depthOf(rooms, room.id);
              const groupStart = depth === 0 && i > 0;
              return (
                <tr key={room.id}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 bg-surface px-3 py-2 text-left align-top border-b border-line ${
                      groupStart ? "border-t-2" : ""
                    } ${depth ? "font-normal" : "font-semibold"}`}
                    style={{ paddingLeft: 12 + depth * 14 }}
                  >
                    {room.name}
                    {room.kvm != null && <span className="block text-xs font-normal text-muted font-mono">{room.kvm} kvm</span>}
                  </th>
                  {days.map((d) => {
                    const direct = visible.filter((b) => b.room_id === room.id && inDay(b, d));
                    const offered = offers.filter((o) => o.room_id === room.id && o.starts_at < dayStartIso(addDays(d, 1)) && o.ends_at > dayStartIso(d));
                    const via = active.filter((b) => b.room_id !== room.id && overlap(b.room_id, room.id) && inDay(b, d));
                    const viaNames = [...new Set(via.map((b) => roomName.get(b.room_id)))].join(", ");
                    const weekend = weekday(d) >= 5;
                    return (
                      <td
                        key={d}
                        className={`relative p-1 align-top border-b border-l border-line h-14 ${groupStart ? "border-t-2" : ""} ${
                          d === today ? "bg-today" : weekend ? "bg-sunk/50" : ""
                        }`}
                      >
                        {booker && (
                          <Link
                            href={`/evenemang/ny?lokal=${room.id}&datum=${d}`}
                            className="absolute inset-0 hover:bg-sunk/70"
                            aria-label={`Boka ${room.name} ${fmtDayMonth(d)}`}
                          />
                        )}
                        <div className="relative grid gap-1 pointer-events-none">
                          {direct.map((b) => (
                            <Link
                              key={b.id}
                              href={`/evenemang/${b.event_id}`}
                              title={`${b.events.title} · ${STATUS_LABEL[b.events.status]}${optionPlace.has(b.event_id) ? ` · ${optionOrdinal(optionPlace.get(b.event_id)!)} option` : ""}`}
                              className={`pointer-events-auto block rounded-md border-l-[3px] px-1.5 py-0.5 text-xs font-semibold leading-tight st-${b.events.status} ${
                                b.events.status === "preliminar" ? "border-dashed" : ""
                              } ${clashing.has(b.id) ? "ring-[1.5px] ring-warn ring-inset" : ""}`}
                              style={b.events.event_type_id && typeColor.has(b.events.event_type_id) ? { borderLeftColor: typeColor.get(b.events.event_type_id) } : undefined}
                            >
                              <span className="block font-mono font-normal opacity-80">{timeLabel(b, d)}</span>
                              <span className="block truncate">
                                {optionPlace.has(b.event_id) && <span className="mr-1 rounded bg-white/70 px-1 font-mono text-[10px]">{optionOrdinal(optionPlace.get(b.event_id)!)}</span>}
                                {b.events.title}
                              </span>
                            </Link>
                          ))}
                          {offered.map((o) => (
                            <Link
                              key={o.id}
                              href={`/offerter/${o.quote_id}#lokaler`}
                              title={`Offert ${o.quotes.number} · ${o.quotes.title} · ${o.quotes.status === "utkast" ? "utkast" : "skickad"}, inte bokad`}
                              className="pointer-events-auto block rounded-md border border-dashed border-brand/60 bg-brand-soft/40 px-1.5 py-0.5 text-xs leading-tight text-brand"
                            >
                              <span className="block font-mono opacity-80">{fmtTime(o.starts_at)}–{fmtTime(o.ends_at)}</span>
                              <span className="block truncate font-semibold">Offert {o.quotes.number}: {o.quotes.title}</span>
                            </Link>
                          ))}
                          {via.length > 0 && (
                            <div
                              className="rounded-md border border-dashed border-line px-1.5 py-0.5 text-[11px] leading-tight text-muted"
                              style={{
                                background:
                                  "repeating-linear-gradient(-45deg, transparent 0 5px, var(--color-sunk) 5px 9px)",
                              }}
                            >
                              Blockerad via {viaNames}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {showStaff && (
              <tr>
                <th colSpan={8} className="sticky left-0 bg-surface px-3 pt-4 pb-1 text-left label border-b border-line">
                  Personal {staffRows.length ? "" : "· inga pass den här veckan"}
                </th>
              </tr>
            )}
            {showStaff &&
              staffRows.map(([fnId, fn]) => (
                <tr key={fnId}>
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left align-top border-b border-line font-normal">
                    <span className="inline-block size-2.5 rounded-full mr-2" style={{ background: fn.color }} />
                    {fn.name}
                  </th>
                  {days.map((d) => {
                    const list = shifts.filter((x) => x.function_id === fnId && isoToDate(x.starts_at) === d);
                    return (
                      <td key={d} className={`p-1 align-top border-b border-l border-line ${d === today ? "bg-today" : weekday(d) >= 5 ? "bg-sunk/50" : ""}`}>
                        <div className="grid gap-1">
                          {list.map((x) => {
                            const filled = x.shift_assignments.filter((a) => a.status === "tilldelad").length;
                            const full = filled >= x.needed;
                            return (
                              <Link
                                key={x.id}
                                href={`/personal/pass/${x.id}`}
                                title={`${fn.name}${x.events ? ` · ${x.events.title}` : ""} · ${filled} av ${x.needed}`}
                                className={`grid rounded px-1.5 py-0.5 text-[11px] leading-tight ${full ? "bg-sunk" : "bg-st-preliminar-soft text-st-preliminar"}`}
                              >
                                <span className="flex items-center justify-between gap-1">
                                  <span className="font-mono">{fmtTime(x.starts_at)}–{fmtTime(x.ends_at)}</span>
                                  <span className="font-semibold tabular-nums">{filled}/{x.needed}</span>
                                </span>
                                {x.events && <span className="truncate">{x.events.title}</span>}
                              </Link>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {booker && <p className="text-sm text-muted">Klicka i en tom ruta för att boka den lokalen den dagen.</p>}
    </>
  );
}


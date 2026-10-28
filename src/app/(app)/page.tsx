import Link from "next/link";
import { canBook, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDays, dayShort, dayStartIso, fmtDayMonth, fmtTime, isoToDate, isoWeek, mondayOf, todayDate, weekday,
} from "@/lib/datum";
import { depthOf, makeOverlap } from "@/lib/lokaler";
import { STATUS_LABEL, type EventStatus, type Room } from "@/lib/types";

export const metadata = { title: "Schema" };

type Row = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  event_id: string;
  events: { title: string; status: EventStatus };
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ vecka?: string; avbokade?: string }>;
}) {
  const sp = await searchParams;
  const today = todayDate();
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.vecka ?? "") ? sp.vecka! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const showCancelled = sp.avbokade === "1";

  const supabase = await createClient();
  const profile = await getProfile();
  const booker = canBook(profile);

  const [{ data: roomData }, { data: bookingData }] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).eq("bookable", true).order("sort_order"),
    supabase
      .from("bookings")
      .select("id, room_id, starts_at, ends_at, event_id, events!inner(title, status)")
      .lt("starts_at", dayStartIso(addDays(monday, 7)))
      .gt("ends_at", dayStartIso(monday))
      .order("starts_at"),
  ]);

  const rooms = (roomData ?? []) as Room[];
  const all = (bookingData ?? []) as unknown as Row[];
  const active = all.filter((b) => ["forfragan", "preliminar", "bekraftad"].includes(b.events.status));
  const visible = all.filter((b) => showCancelled || b.events.status !== "avbokad");
  const overlap = makeOverlap(rooms);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  // Bokningar som krockar med någon annan aktiv bokning.
  const clashing = new Set<string>();
  for (const a of active)
    for (const b of active)
      if (a.id !== b.id && a.starts_at < b.ends_at && b.starts_at < a.ends_at && overlap(a.room_id, b.room_id))
        clashing.add(a.id);

  const inDay = (b: Row, d: string) => b.starts_at < dayStartIso(addDays(d, 1)) && b.ends_at > dayStartIso(d);
  const timeLabel = (b: Row, d: string) => {
    const s = isoToDate(b.starts_at) < d ? "←" : fmtTime(b.starts_at);
    const endDay = isoToDate(b.ends_at);
    const e = endDay > d ? (endDay === addDays(d, 1) && fmtTime(b.ends_at) === "00:00" ? "24" : "→") : fmtTime(b.ends_at);
    return `${s}–${e}`;
  };

  const q = (vecka: string) => `/?vecka=${vecka}${showCancelled ? "&avbokade=1" : ""}`;

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
        <Link
          className="text-sm text-muted underline-offset-2 hover:underline"
          href={`/?vecka=${monday}${showCancelled ? "" : "&avbokade=1"}`}
        >
          {showCancelled ? "Dölj avbokade" : "Visa avbokade"}
        </Link>
        <Link className="btn" href={`/manad?m=${monday.slice(0, 7)}`}>Månadsvy</Link>
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
      </div>

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
                              title={`${b.events.title} · ${STATUS_LABEL[b.events.status]}`}
                              className={`pointer-events-auto block rounded-md border-l-[3px] px-1.5 py-0.5 text-xs font-semibold leading-tight st-${b.events.status} ${
                                b.events.status === "preliminar" ? "border-dashed" : ""
                              } ${clashing.has(b.id) ? "ring-[1.5px] ring-warn ring-inset" : ""}`}
                            >
                              <span className="block font-mono font-normal opacity-80">{timeLabel(b, d)}</span>
                              <span className="block truncate">{b.events.title}</span>
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
          </tbody>
        </table>
      </div>
      {booker && <p className="text-sm text-muted">Klicka i en tom ruta för att boka den lokalen den dagen.</p>}
    </>
  );
}


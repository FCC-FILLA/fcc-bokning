import Link from "next/link";
import { canBook, getProfile } from "@/lib/auth";
import { addDays, fmtRange, localToIso, todayDate } from "@/lib/datum";
import { depthOf, makeOverlap } from "@/lib/lokaler";
import { createClient } from "@/lib/supabase/server";
import type { EventStatus, Room, RoomCapacity, Setup } from "@/lib/types";

export const metadata = { title: "Hitta ledig lokal" };

type Hit = { room_id: string; starts_at: string; ends_at: string; event_id: string; events: { title: string; status: EventStatus } };

export default async function FreeRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ datum?: string; fran?: string; till?: string; gaster?: string; moblering?: string; dagar?: string }>;
}) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : todayDate();
  const from = /^\d{2}:\d{2}$/.test(sp.fran ?? "") ? sp.fran! : "08:00";
  const to = /^\d{2}:\d{2}$/.test(sp.till ?? "") ? sp.till! : "17:00";
  const guests = Math.max(0, Number(sp.gaster) || 0);
  const setupId = sp.moblering ?? "";
  const days = Math.min(14, Math.max(1, Number(sp.dagar) || 1));
  const searched = Boolean(sp.datum);

  const startIso = localToIso(`${date}T${from}`);
  const lastDay = addDays(date, days - 1);
  const endIso = localToIso(`${to <= from ? addDays(lastDay, 1) : lastDay}T${to}`);

  const supabase = await createClient();
  const profile = await getProfile();
  const [{ data: r }, { data: c }, { data: s }, { data: b }] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).eq("bookable", true).order("sort_order"),
    supabase.from("room_capacities").select("*"),
    supabase.from("setups").select("*").order("sort_order"),
    searched
      ? supabase
          .from("bookings")
          .select("room_id, starts_at, ends_at, event_id, events!inner(title, status)")
          .in("events.status", ["forfragan", "preliminar", "bekraftad"])
          .lt("starts_at", endIso)
          .gt("ends_at", startIso)
      : Promise.resolve({ data: [] }),
  ]);
  const rooms = (r ?? []) as Room[];
  const caps = (c ?? []) as RoomCapacity[];
  const setups = (s ?? []) as Setup[];
  const hits = (b ?? []) as unknown as Hit[];
  const overlap = makeOverlap(rooms);

  // Flerdagarsbokning: samma tider varje dag. Kontrollera varje dag för sig.
  const windows = Array.from({ length: days }, (_, i) => {
    const d = addDays(date, i);
    return { s: localToIso(`${d}T${from}`), e: localToIso(`${to <= from ? addDays(d, 1) : d}T${to}`) };
  });
  const capFor = (roomId: string) => {
    const rc = caps.filter((x) => x.room_id === roomId);
    if (setupId) return rc.find((x) => x.setup_id === setupId)?.capacity ?? null;
    return rc.length ? Math.max(...rc.map((x) => x.capacity)) : null;
  };

  const results = rooms.map((room) => {
    const blocking = hits.filter(
      (h) => overlap(h.room_id, room.id) && windows.some((w) => h.starts_at < w.e && h.ends_at > w.s),
    );
    const cap = capFor(room.id);
    const fits = !guests || (cap != null && cap >= guests);
    const setupOk = !setupId || cap != null;
    const firm = blocking.some((h) => h.events.status === "bekraftad");
    return { room, cap, fits, setupOk, blocking, free: blocking.length === 0, firm };
  });
  const free = results.filter((x) => x.free && x.fits && x.setupOk).sort((a, b) => (a.cap ?? 9e9) - (b.cap ?? 9e9));
  const tentative = results.filter((x) => !x.free && !x.firm && x.fits && x.setupOk);
  const tooSmall = results.filter((x) => x.free && (!x.fits || !x.setupOk) && x.cap != null);
  const booker = canBook(profile);
  const bookHref = (roomId: string) => `/evenemang/ny?lokal=${roomId}&datum=${date}&fran=${from}&till=${to}`;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Hitta ledig lokal</h1>
        <p className="text-sm text-muted">Visar salar som är lediga hela tiden och rymmer gästerna. Delar av en bokad sal räknas som upptagna, och tvärtom.</p>
      </div>

      <form method="get" className="card p-4 flex flex-wrap items-end gap-3">
        <div className="field"><label className="label" htmlFor="datum">Datum</label><input className="input" id="datum" name="datum" type="date" defaultValue={date} required /></div>
        <div className="field w-28"><label className="label" htmlFor="fran">Från</label><input className="input" id="fran" name="fran" type="time" step={900} defaultValue={from} /></div>
        <div className="field w-28"><label className="label" htmlFor="till">Till</label><input className="input" id="till" name="till" type="time" step={900} defaultValue={to} /></div>
        <div className="field w-24"><label className="label" htmlFor="dagar">Antal dagar</label><input className="input" id="dagar" name="dagar" type="number" min={1} max={14} defaultValue={days} /></div>
        <div className="field w-28"><label className="label" htmlFor="gaster">Gäster</label><input className="input" id="gaster" name="gaster" type="number" min={0} inputMode="numeric" defaultValue={guests || ""} /></div>
        <div className="field">
          <label className="label" htmlFor="moblering">Möblering</label>
          <select className="input" id="moblering" name="moblering" defaultValue={setupId}>
            <option value="">Spelar ingen roll</option>
            {setups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Sök</button>
      </form>

      {!searched ? (
        <p className="text-muted">Fyll i datum och tid och tryck på Sök.</p>
      ) : (
        <div className="grid gap-5">
          <p className="text-sm">
            {fmtRange(startIso, windows[0].e)}
            {days > 1 ? `, ${days} dagar i följd` : ""}
            {guests ? `, ${guests} gäster` : ""}
            {setupId ? `, ${setups.find((x) => x.id === setupId)?.name.toLowerCase()}` : ""}
          </p>

          <section className="grid gap-2">
            <h2 className="text-lg font-semibold text-ok">Lediga ({free.length})</h2>
            {free.length === 0 ? (
              <p className="text-sm text-muted">Ingen sal som passar är ledig hela tiden. Se förslagen nedan.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {free.map((x) => (
                  <li key={x.room.id} className="card p-4 grid gap-1 border-l-4 border-l-ok">
                    <span className="font-semibold">{x.room.name}</span>
                    <span className="text-sm text-muted">
                      {x.room.kvm != null ? `${x.room.kvm} kvm` : ""}
                      {x.cap != null ? ` · ${setupId ? "" : "max "}${x.cap} pers.` : ""}
                      {depthOf(rooms, x.room.id) ? " · del av större sal" : ""}
                    </span>
                    {booker && <Link className="btn btn-primary justify-self-start mt-1" href={bookHref(x.room.id)}>Boka</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {tentative.length > 0 && (
            <section className="grid gap-2">
              <h2 className="text-lg font-semibold text-st-preliminar">Upptagna av förfrågan eller preliminär bokning ({tentative.length})</h2>
              <p className="text-sm text-muted">Kan bli lediga om bokningen inte bekräftas.</p>
              <ul className="grid gap-1 text-sm">
                {tentative.map((x) => (
                  <li key={x.room.id}>
                    <span className="font-semibold">{x.room.name}</span>
                    {x.cap != null && <span className="text-muted"> ({x.cap} pers.)</span>}:{" "}
                    {[...new Map(x.blocking.map((h) => [h.event_id, h])).values()].map((h, i) => (
                      <span key={h.event_id}>
                        {i > 0 && ", "}
                        <Link className="underline" href={`/evenemang/${h.event_id}`}>{h.events.title}</Link>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tooSmall.length > 0 && (
            <section className="grid gap-1">
              <h2 className="font-semibold text-muted">Lediga men för små eller utan vald möblering</h2>
              <p className="text-sm text-muted">{tooSmall.map((x) => `${x.room.name}${x.cap != null ? ` (${x.cap})` : ""}`).join(", ")}</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

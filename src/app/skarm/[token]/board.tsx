"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { dayLong, dayShort, fmtDayMonth, fmtTime, isoToDate, isoWeek } from "@/lib/datum";
import { eventsOn, nextDays, roomStates, staffing, type DaySpan, type ScreenFeed } from "@/lib/skarm";

const REFRESH_MS = 5 * 60 * 1000;
const n = (x: number) => x.toLocaleString("sv-SE");
const color = (c: string | null): CSSProperties => ({ "--c": c ?? "#6b6b6b" }) as CSSProperties;

export function Board({ feed }: { feed: ScreenFeed }) {
  const router = useRouter();
  // Startar på serverns tid så att första renderingen stämmer, går sedan på skärmens klocka.
  const [now, setNow] = useState(() => new Date(feed.now));

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const clock = setInterval(tick, 1000);
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        navigator.wakeLock?.request("screen").catch(() => {});
      }
    };
    navigator.wakeLock?.request("screen").catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  // Nytt dygn: hämta om direkt i stället för att vänta på nästa uppdatering.
  const today = isoToDate(now.toISOString());
  const feedDay = isoToDate(feed.now);
  useEffect(() => {
    if (today !== feedDay) router.refresh();
  }, [today, feedDay, router]);

  const spans = eventsOn(feed.events, today);
  const staff = staffing(spans, today);
  const guests = spans.reduce((s, x) => s + (x.event.participants ?? 0), 0);
  const roomsUsed = new Set(spans.flatMap((s) => s.bookings.map((b) => b.room))).size;
  const days = nextDays(today);
  const upcoming = days.map((d) => ({ date: d, spans: eventsOn(feed.events, d) }));
  const weekCount = new Set(upcoming.flatMap((d) => d.spans.map((s) => s.event.id))).size;
  const next = feed.events.filter((e) => new Date(e.start) > now).sort((a, b) => +new Date(a.start) - +new Date(b.start))[0];
  const rooms = roomStates(feed.rooms, spans, now);
  const time = fmtTime(now.toISOString());

  // Veckan scrollar inte: bara hela dagar som får plats visas, resten döljs.
  const weekRef = useRef<HTMLDivElement>(null);
  const [shownDays, setShownDays] = useState(upcoming.length);
  const weekKey = JSON.stringify(upcoming.map((d) => [d.date, d.spans.map((x) => x.event.id)]));
  useLayoutEffect(() => {
    const box = weekRef.current;
    if (!box) return;
    const fit = () => {
      const days = [...box.querySelectorAll<HTMLElement>(".skarm-day")];
      days.forEach((d) => (d.hidden = false));
      if (getComputedStyle(box).overflow === "visible") return setShownDays(days.length);
      const bottom = box.getBoundingClientRect().bottom;
      // Första dagen som inte får plats hela, och alla efter den, döljs.
      let shown = days.findIndex((d) => d.getBoundingClientRect().bottom > bottom + 1);
      if (shown === -1) shown = days.length;
      days.slice(shown).forEach((d) => (d.hidden = true));
      setShownDays(shown);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [weekKey]);

  return (
    <div className="skarm">
      <header className="skarm-head">
        <div className="skarm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fcc-logo-white.svg" alt="" width={380} height={96} className="skarm-logo" />
          <h1 className="sr-only">Filadelfia Convention Center</h1>
          <p>Event idag och veckan framåt</p>
        </div>
        <div className="skarm-clock">
          <div className="skarm-time">{time}</div>
          <div className="skarm-date">
            {dayLong(today).toLowerCase()} {fmtDayMonth(today)} · vecka {isoWeek(today)}
          </div>
        </div>
      </header>

      <main className="skarm-main">
        <section className="skarm-col">
          <div className="skarm-sec">
            <h2>Idag</h2>
          </div>
          {spans.length > 0 && (
            <div className="skarm-stats">
              <Stat value={n(spans.length)} label="event" />
              <Stat value={guests ? n(guests) : "–"} label="förväntade gäster" />
              <Stat value={n(roomsUsed)} label={roomsUsed === 1 ? "lokal bokad" : "lokaler bokade"} />
              <Stat value={staff.needed ? `${staff.assigned}/${staff.needed}` : "–"} label="personal bemannad" warn={staff.assigned < staff.needed} />
            </div>
          )}
          <div className="skarm-scroll">
            {spans.length ? (
              spans.map((s) => <TodayCard key={s.event.id} span={s} now={now} today={today} />)
            ) : (
              <div className="skarm-empty">
                <h3>Inga event idag</h3>
                <p>Inga bokade arrangemang i huset idag.</p>
                {next && (
                  <p className="skarm-next">
                    Nästa: <b>{next.title}</b> · {dayLong(isoToDate(next.start)).toLowerCase()} {fmtDayMonth(isoToDate(next.start))} {fmtTime(next.start)}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="skarm-col">
          <div className="skarm-sec">
            <h2>Veckan framåt</h2>
            <span>
              {weekCount ? `${weekCount} event kommande 7 dagar` : "Inga event kommande 7 dagar"}
              {shownDays < upcoming.length && ` · visar ${shownDays} av ${upcoming.length} dagar`}
            </span>
          </div>
          <div className="skarm-fit" ref={weekRef}>
            <div className="skarm-week">
              {upcoming.map(({ date, spans }) => (
                <div key={date} className={`skarm-day${spans.length ? "" : " is-empty"}`}>
                  <div className="skarm-dayname">
                    <span>{dayShort(date)}</span>
                    <b>{Number(date.slice(8))}</b>
                  </div>
                  <div className="skarm-items">
                    {spans.length ? (
                      spans.map((s) => <WeekItem key={s.event.id} span={s} />)
                    ) : (
                      <span className="skarm-none">Inga bokningar</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="skarm-foot">
        <div className="skarm-strip">
          {rooms.map((r) => (
            <div key={r.room} className={`skarm-room is-${r.kind}`}>
              <b>{r.room}</b>
              <span>
                {r.kind === "live" && `Nu: ${r.title} till ${fmtTime(r.end!)}`}
                {r.kind === "next" && `${fmtTime(r.start!)} ${r.title}`}
                {r.kind === "done" && "Klart för idag"}
                {r.kind === "free" && "Ledigt idag"}
              </span>
            </div>
          ))}
        </div>
        <p className="skarm-src">Från FCC Bokning · hämtad {fmtTime(feed.now)} · uppdateras var femte minut</p>
      </footer>
    </div>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className={`skarm-stat${warn ? " is-warn" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function TodayCard({ span, now, today }: { span: DaySpan; now: Date; today: string }) {
  const { event: e, start, end, bookings } = span;
  const live = new Date(start) <= now && now < new Date(end);
  const past = new Date(end) <= now;
  const shifts = e.shifts.filter((s) => isoToDate(s.start) === today);

  // Rum med samma tid och möblering slås ihop; tiden visas bara om rummen har olika tider.
  const spansDiffer = new Set(bookings.map((b) => `${b.start}|${b.end}`)).size > 1;

  return (
    <article className={`skarm-card${live ? " is-live" : ""}${past ? " is-past" : ""}`}>
      <div className="skarm-when">
        {fmtTime(start)}
        <small>till {fmtTime(end)}</small>
      </div>
      <div className="skarm-body">
        <h3>
          {e.title}
          <span className="skarm-pill" style={color(e.color)}>
            <i />
            {e.type ?? "Event"}
          </span>
          {e.status === "preliminar" && <span className="skarm-pill is-prel">Preliminär</span>}
          {live && <span className="skarm-pill is-now">Pågår nu</span>}
        </h3>
        <p className="skarm-facts">
          {e.company && <span>Kund <b>{e.company}</b></span>}
          {e.participants ? <span><b>{n(e.participants)}</b> gäster</span> : null}
          {e.responsible && <span>Ansvarig <b>{e.responsible}</b></span>}
        </p>
        <div className="skarm-chips">
          {bookings.map((b, i) => (
            <span key={i} className="skarm-chip">
              {b.phase === "bygg" && <em>Bygg</em>}
              {b.phase === "riv" && <em>Riv</em>}
              {b.room}
              {spansDiffer && <small>{fmtTime(b.start)}–{fmtTime(b.end)}</small>}
              {b.setup && <small>{b.setup}</small>}
            </span>
          ))}
        </div>
        {shifts.length > 0 && (
          <div className="skarm-shifts">
            {shifts.map((s, i) => (
              <span key={i} className="skarm-shift" style={color(s.color)}>
                <i />
                {s.function} <small>{fmtTime(s.start)}</small>
                <b className={s.assigned < s.needed ? "is-short" : ""}>{s.assigned}/{s.needed}</b>
              </span>
            ))}
          </div>
        )}
        {e.staff_info && <p className="skarm-note">{e.staff_info}</p>}
      </div>
    </article>
  );
}

function WeekItem({ span }: { span: DaySpan }) {
  const { event: e, start, end, bookings } = span;
  const rooms = [...new Set(bookings.map((b) => b.room))];
  const roomText = rooms.length > 3 ? `${rooms.slice(0, 2).join(", ")} +${rooms.length - 2}` : rooms.join(", ");
  return (
    <div className="skarm-wi" style={color(e.color)}>
      <i />
      <div>
        <b>
          {e.title}
          {e.status === "preliminar" && <span className="skarm-pill is-prel">Prel.</span>}
        </b>
        <span>
          <span className="skarm-num">{fmtTime(start)}–{fmtTime(end)}</span> · {roomText}
          {e.participants ? ` · ${n(e.participants)} gäster` : ""}
        </span>
      </div>
    </div>
  );
}

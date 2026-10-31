"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isoToDate } from "@/lib/datum";
import { cameraOf, minutesUntil, nowNext, parseInfo, pickEvent, TEXT, type Lang, type LangMode, type LogeFeed } from "@/lib/loge";
import { useFitText } from "@/components/use-fit";
import { CameraView } from "./camera";

const TZ = "Europe/Stockholm";
const REFRESH_MS = 2 * 60 * 1000;
const SWITCH_MS = 20 * 1000;
const locale = (l: Lang) => (l === "sv" ? "sv-SE" : "en-GB");
const time = (iso: string | number | Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function LogeBoard({ feed, mode: initialMode }: { feed: LogeFeed; mode: LangMode }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(feed.now));
  const [mode, setMode] = useState<LangMode>(initialMode);
  const [flip, setFlip] = useState<Lang>("sv");
  const lang: Lang = mode === "vaxla" ? flip : mode;
  const T = TEXT[lang];

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

  // Växla språk av sig själv när länken har ?sprak=vaxla (för skärmar utan fjärrkontroll).
  useEffect(() => {
    if (mode !== "vaxla") return;
    const id = setInterval(() => setFlip((l) => (l === "sv" ? "en" : "sv")), SWITCH_MS);
    return () => clearInterval(id);
  }, [mode]);

  const today = isoToDate(now.toISOString());
  const feedDay = isoToDate(feed.now);
  useEffect(() => {
    if (today !== feedDay) router.refresh();
  }, [today, feedDay, router]);

  const choose = (l: Lang) => {
    setMode(l);
    const url = new URL(window.location.href);
    url.searchParams.set("sprak", l);
    window.history.replaceState(null, "", url);
  };

  const event = pickEvent(feed.events);
  const others = feed.events.filter((e) => e.id !== event?.id);
  const items = event?.run_sheet ?? [];
  const { current, next } = nowNext(items, now);
  const camera = useMemo(() => cameraOf(feed.settings.loge_camera_url), [feed.settings.loge_camera_url]);
  const info = parseInfo(lang === "sv" ? feed.settings.loge_info_sv : feed.settings.loge_info_en || feed.settings.loge_info_sv);
  const wifiName = feed.settings.loge_wifi_name?.trim();
  const wifiPass = feed.settings.loge_wifi_password?.trim();
  const room = (x: { room: string | null; room_en: string | null }) => (lang === "en" && x.room_en ? x.room_en : x.room);

  const [leftBox, leftInner] = useFitText(`${lang}|${event?.id}|${items.length}|${current}|${next}|${others.length}`);
  const [rightBox, rightInner] = useFitText(`${lang}|${info.length}|${wifiName}|${camera.kind}`);

  const date = new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  const nextItem = next >= 0 ? items[next] : null;
  const mins = nextItem ? minutesUntil(nextItem.starts_at, now) : 0;

  return (
    <div className="loge" lang={lang}>
      <header className="loge-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fcc-logo-white.svg" alt="Filadelfia Convention Center" width={380} height={96} className="loge-logo" />
        <div className="loge-head-right">
          <div className="loge-lang" role="group" aria-label="Språk / Language">
            {(["sv", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => choose(l)}>
                {l === "sv" ? "Svenska" : "English"}
              </button>
            ))}
          </div>
          <div className="loge-clock">
            <div className="loge-time">{time(now)}</div>
            <div className="loge-date">{date}</div>
          </div>
        </div>
      </header>

      <main className={`loge-main${camera.kind === "none" ? " no-cam" : ""}`}>
        <section className="loge-col" ref={leftBox}>
          <div className="loge-fitted" ref={leftInner}>
            <div className="loge-hello">
              <span>{event ? T.welcome : T.welcomeHouse}</span>
              {event && <h1>{event.title}</h1>}
            </div>

            {event && nextItem && (
              <div className="loge-next">
                <span className="loge-tag">{T.next}</span>
                <b>{nextItem.title}</b>
                <span>{mins <= 90 ? T.inMin(mins) : T.at(time(nextItem.starts_at))}</span>
              </div>
            )}

            {event && items.length > 0 && (
              <div className="loge-block">
                <h2>{T.schedule}</h2>
                <ol className="loge-run">
                  {items.map((x, i) => (
                    <li key={i} className={i === current ? "is-now" : i < (next < 0 ? items.length : next) && i !== current ? "is-past" : ""}>
                      <span className="loge-run-time">{time(x.starts_at)}</span>
                      <span className="loge-run-what">
                        <b>{x.title}</b>
                        {(x.who || room(x)) && <small>{[x.who, room(x)].filter(Boolean).join(" · ")}</small>}
                      </span>
                      {i === current && <span className="loge-tag">{T.now}</span>}
                    </li>
                  ))}
                </ol>
                {current < 0 && next < 0 && <p className="loge-muted">{T.done}</p>}
              </div>
            )}

            {event && items.length === 0 && (
              <div className="loge-block">
                <h2>{T.rooms}</h2>
                <ul className="loge-run">
                  {event.bookings.map((b, i) => {
                    const live = new Date(b.start) <= now && now < new Date(b.end);
                    return (
                      <li key={i} className={live ? "is-now" : new Date(b.end) <= now ? "is-past" : ""}>
                        <span className="loge-run-time">{time(b.start)}–{time(b.end)}</span>
                        <span className="loge-run-what"><b>{room(b)}</b></span>
                        {live && <span className="loge-tag">{T.now}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!event && <p className="loge-muted loge-empty">{T.noEvent}</p>}

            {others.length > 0 && (
              <div className="loge-block loge-others">
                <h2>{T.alsoToday}</h2>
                <ul>
                  {others.map((e) => (
                    <li key={e.id}>
                      <span className="loge-run-time">{time(e.start)}</span> {e.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="loge-side">
          {camera.kind !== "none" && (
            <div className="loge-cam">
              <span className="loge-cam-label"><i />{T.camera}</span>
              <CameraView key={"src" in camera ? camera.src : "none"} camera={camera} offText={T.cameraOff} />
            </div>
          )}
          <div className="loge-info" ref={rightBox}>
            <div className="loge-fitted" ref={rightInner}>
              {wifiName && (
                <div className="loge-wifi">
                  <h2>{T.wifi}</h2>
                  <dl>
                    <div><dt>{T.network}</dt><dd>{wifiName}</dd></div>
                    {wifiPass && <div><dt>{T.password}</dt><dd>{wifiPass}</dd></div>}
                  </dl>
                </div>
              )}
              {info.map((b, i) => (
                <div key={i} className="loge-block">
                  {b.heading && <h2>{b.heading}</h2>}
                  <ul className="loge-list">
                    {b.lines.map((l, j) => <li key={j}>{l}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

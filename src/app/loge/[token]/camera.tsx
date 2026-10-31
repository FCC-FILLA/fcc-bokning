"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { UNIFI_FRAME, unifiCrop, type Camera } from "@/lib/loge";

/** Kamerabilden från scenen. Klarar HLS (.m3u8), MJPEG, stillbilder som uppdateras, mp4 och vanliga inbäddningssidor. */
// memo: skärmens klocka renderar om varje sekund, men strömmen ska inte startas om.
// Byts länken monteras komponenten om (key i föräldern).
export const CameraView = memo(function CameraView({ camera, offText }: { camera: Camera; offText: string }) {
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  // Försök igen efter en halv minut om strömmen tappades.
  useEffect(() => {
    if (!failed) return;
    const id = setTimeout(() => setFailed(false), 30000);
    return () => clearTimeout(id);
  }, [failed]);

  if (camera.kind === "none" || failed) return <div className="loge-cam-off">{offText}</div>;
  if (camera.kind === "unifi") return <UnifiFrame src={camera.src} />;
  if (camera.kind === "iframe")
    return <iframe className="loge-cam-media" src={camera.src} title="Kamera" allow="autoplay; fullscreen; encrypted-media" referrerPolicy="no-referrer" />;
  if (camera.kind === "mjpeg")
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="loge-cam-media" src={camera.src} alt="" onError={fail} />;
  if (camera.kind === "snapshot") return <Snapshot src={camera.src} onFail={fail} />;
  return <Video camera={camera} onFail={fail} />;
});

function Snapshot({ src, onFail }: { src: string; onFail: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const url = `${src}${src.includes("?") ? "&" : "?"}_=${n}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="loge-cam-media" src={url} alt="" onError={n === 0 ? onFail : undefined} />;
}

function Video({ camera, onFail }: { camera: Extract<Camera, { kind: "hls" | "video" }>; onFail: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (camera.kind === "video" || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = camera.src;
      video.play().catch(() => {});
      return;
    }
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return onFail();
      const h = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
      hls = h;
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => h.startLoad(), 5000);
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        else onFail();
      });
      h.loadSource(camera.src);
      h.attachMedia(video);
      video.play().catch(() => {});
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [camera, onFail]);
  return <video ref={ref} className="loge-cam-media" muted autoPlay playsInline loop={camera.kind === "video"} onError={camera.kind === "video" ? onFail : undefined} />;
}

/** UniFi-delningssidan i fast storlek, uppskalad och förskjuten så att bara videon syns i rutan. */
function UnifiFrame({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<{ scale: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setT(unifiCrop(el.clientWidth, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="loge-cam-media loge-cam-crop">
      <iframe
        src={src}
        title="Kamera"
        allow="autoplay; fullscreen; encrypted-media"
        referrerPolicy="no-referrer"
        tabIndex={-1}
        style={{
          width: UNIFI_FRAME.width,
          height: UNIFI_FRAME.height,
          transform: t ? `translate(${t.x}px, ${t.y}px) scale(${t.scale})` : undefined,
          visibility: t ? "visible" : "hidden",
        }}
      />
    </div>
  );
}

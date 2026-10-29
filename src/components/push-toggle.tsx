"use client";

import { useEffect, useState } from "react";

type State = "laddar" | "stods-ej" | "ios-hemskarm" | "av" | "pa" | "nekad" | "fel";

const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Slå på eller av appnotiser på den här enheten. */
export function PushToggle({ publicKey, save, remove }: { publicKey: string; save: (sub: string) => Promise<void>; remove: (endpoint: string) => Promise<void> }) {
  const [state, setState] = useState<State>("laddar");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
        return setState(ios && !standalone ? "ios-hemskarm" : "stods-ej");
      }
      if (Notification.permission === "denied") return setState("nekad");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "pa" : "av");
    })().catch(() => setState("fel"));
  }, [publicKey]);

  async function turnOn() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "nekad" : "av");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }));
      await save(JSON.stringify(sub));
      setState("pa");
    } catch {
      setState("fel");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("av");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<State, string> = {
    laddar: "",
    "stods-ej": "Den här webbläsaren kan inte ta emot notiser.",
    "ios-hemskarm": "På iPhone: tryck på Dela-knappen och välj ”Lägg till på hemskärmen”. Öppna sedan appen därifrån och slå på notiser.",
    av: "Få en notis när du får ett pass, när nya pass läggs ut i dina funktioner och när din tid behöver ses över.",
    pa: "Notiser är på för den här enheten.",
    nekad: "Notiser är blockerade. Tillåt dem i webbläsarens eller telefonens inställningar för den här sidan.",
    fel: "Det gick inte att slå på notiser. Försök igen.",
  };
  if (state === "laddar") return null;

  return (
    <div className="card p-4 flex flex-wrap items-center gap-3">
      <span className="text-xl" aria-hidden>🔔</span>
      <p className="text-sm flex-1 min-w-48">{text[state]}</p>
      {(state === "av" || state === "fel") && (
        <button className="btn btn-primary" type="button" onClick={turnOn} disabled={busy}>Slå på notiser</button>
      )}
      {state === "pa" && (
        <button className="btn btn-ghost" type="button" onClick={turnOff} disabled={busy}>Stäng av</button>
      )}
    </div>
  );
}

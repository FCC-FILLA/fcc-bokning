"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INVALID = "Länken är ogiltig eller har gått ut. Be en administratör skicka en ny.";

/**
 * Tar emot Supabase standardlänkar i inbjudnings- och återställningsmejl.
 * De landar på sidan med inloggningsuppgifterna i adressens #-del.
 * Vi sparar sessionen och skickar användaren vidare för att välja lösenord.
 */
async function consumeLinkHash(show: (m: string) => void) {
  await Promise.resolve();
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const clearHash = () => history.replaceState(null, "", window.location.pathname);

  if (hash.get("error")) {
    show(INVALID);
    clearHash();
    return;
  }
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (!access_token || !refresh_token) return;

  show("Loggar in…");
  const { error } = await createClient().auth.setSession({ access_token, refresh_token });
  if (error) {
    show(INVALID);
    clearHash();
    return;
  }
  const type = hash.get("type");
  window.location.replace(type === "invite" || type === "recovery" ? "/konto/losenord" : "/");
}

export function LinkSession() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void consumeLinkHash(setMessage);
  }, []);

  if (!message) return null;
  return <p className="rounded-lg bg-sunk px-4 py-3 text-sm">{message}</p>;
}

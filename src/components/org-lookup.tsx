"use client";

import { useRef, useState, useTransition } from "react";
import type { OrgInfo } from "@/lib/bolagsverket";

/** Organisationsnummer med knapp som hämtar namn och adress från Bolagsverket och fyller i formuläret. */
export function OrgLookup({ defaultValue, lookup }: { defaultValue?: string | null; lookup: (nr: string) => Promise<{ info?: OrgInfo; error?: string }> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await lookup(ref.current?.value ?? "");
      if (!r.info) return setMsg({ ok: false, text: r.error ?? "Hittade inget." });
      const form = ref.current!.form!;
      const set = (name: string, v?: string, force = false) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el && v && (force || !el.value)) el.value = v;
      };
      set("org_nr", r.info.org_nr, true);
      set("name", r.info.name);
      set("address", r.info.address);
      set("postal_code", r.info.postal_code);
      set("city", r.info.city);
      set("country", "Sverige");
      setMsg({ ok: true, text: `Hittade ${r.info.name}${r.info.legal_form ? ` (${r.info.legal_form})` : ""}. Tomma fält är ifyllda.` });
    });

  return (
    <div className="field">
      <label className="label" htmlFor="org_nr">Organisationsnummer</label>
      <div className="flex gap-2">
        <input ref={ref} className="input" id="org_nr" name="org_nr" defaultValue={defaultValue ?? ""} placeholder="556xxx-xxxx" />
        <button type="button" className="btn shrink-0" onClick={run} disabled={pending}>{pending ? "Söker…" : "Hämta"}</button>
      </div>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-warn"}`}>{msg.text}</span>}
    </div>
  );
}

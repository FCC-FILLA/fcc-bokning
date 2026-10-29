"use client";

import { useEffect, useState } from "react";

export type EventTab = { id: string; label: string; badge?: string | number | null; warn?: boolean };

/**
 * Flikar på evenemangssidan. Allt renderas på servern; fliken väljs här.
 * Ett ankare i adressen (#bokningar, #eventsida …) öppnar fliken som innehåller det, så att formulären kommer tillbaka rätt.
 */
export function EventTabs({ tabs, panels }: { tabs: EventTab[]; panels: Record<string, React.ReactNode> }) {
  const [active, setActive] = useState(tabs[0].id);

  useEffect(() => {
    const pick = () => {
      const hash = decodeURIComponent(location.hash.slice(1));
      if (!hash) return;
      if (tabs.some((t) => t.id === hash)) return setActive(hash);
      const panel = document.getElementById(hash)?.closest<HTMLElement>("[data-tab]");
      if (panel?.dataset.tab) {
        setActive(panel.dataset.tab);
        requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
      }
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, [tabs]);

  const choose = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
  };

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Delar av evenemanget" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`flik-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => choose(t.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active === t.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge !== "" && t.badge !== 0 && (
              <span className={`rounded-full px-1.5 py-px text-xs tabular-nums ${t.warn ? "bg-warn-soft text-warn" : "bg-sunk text-muted"}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`flik-${t.id}`} data-tab={t.id} hidden={active !== t.id} className="grid gap-5">
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}

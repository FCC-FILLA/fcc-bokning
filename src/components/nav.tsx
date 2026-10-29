"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; adminOnly?: boolean };
type Section = { id: string; label: string; href: string; items: Item[] };

const SECTIONS: Section[] = [
  { id: "oversikt", label: "Översikt", href: "/", items: [] },
  {
    id: "kalender",
    label: "Kalender",
    href: "/vecka",
    items: [
      { href: "/vecka", label: "Vecka" },
      { href: "/manad", label: "Månad" },
      { href: "/dagsblad", label: "Dagsblad" },
      { href: "/ledigt", label: "Ledig lokal" },
      { href: "/krockar", label: "Krockar" },
    ],
  },
  {
    id: "evenemang",
    label: "Evenemang",
    href: "/evenemang",
    items: [
      { href: "/evenemang", label: "Alla evenemang" },
      { href: "/mallar", label: "Mallar" },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    href: "/personal",
    items: [
      { href: "/personal", label: "Pass" },
      { href: "/personal/personer", label: "Personer" },
      { href: "/personal/funktioner", label: "Funktioner" },
    ],
  },
  {
    id: "forsaljning",
    label: "Försäljning",
    href: "/offerter",
    items: [
      { href: "/offerter", label: "Offerter" },
      { href: "/kunder", label: "Kunder" },
    ],
  },
];

const SETTINGS: Section = {
  id: "installningar",
  label: "Inställningar",
  href: "/installningar",
  items: [
    { href: "/installningar", label: "Översikt" },
    { href: "/lokaler", label: "Lokaler" },
    { href: "/prislista", label: "Prislista" },
    { href: "/installningar/offert", label: "Offert" },
    { href: "/installningar/foretag", label: "Företagsuppgifter" },
    { href: "/anvandare", label: "Användare", adminOnly: true },
    { href: "/konto", label: "Mitt konto" },
  ],
};

const matches = (path: string, href: string) => (href === "/" || href === "/installningar" ? path === href : path === href || path.startsWith(`${href}/`));

/** Vilken undersida (och därmed sektion) som är aktiv: den längsta adress som matchar. */
function locate(path: string) {
  let best: { section: Section; item: Item | null; len: number } | null = null;
  for (const section of [...SECTIONS, SETTINGS]) {
    if (section.items.length === 0 && matches(path, section.href)) best = { section, item: null, len: section.href.length };
    for (const item of section.items) {
      if (matches(path, item.href) && item.href.length > (best?.len ?? -1)) best = { section, item, len: item.href.length };
    }
  }
  return best;
}

export function Nav({ conflictCount }: { conflictCount: number }) {
  const path = usePathname();
  const here = locate(path);

  const top = (s: Section, extra?: React.ReactNode) => {
    const active = here?.section.id === s.id;
    return (
      <Link
        key={s.id}
        href={s.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium font-display transition-colors ${
          active ? "bg-white text-brand" : "text-white/85 hover:bg-white/10 hover:text-white"
        }`}
      >
        {extra}
        {s.label}
        {s.id === "kalender" && conflictCount > 0 && (
          <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? "bg-brand text-white" : "bg-white text-brand"}`} title={`${conflictCount} krockar`}>
            {conflictCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Huvudmeny">
        {SECTIONS.map((s) => top(s))}
        <span className="flex-1" />
        {top(
          SETTINGS,
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>,
        )}
      </nav>
    </>
  );
}

/** Underflikarna för den aktiva sektionen, som en ljus rad under huvudmenyn. */
export function SubNav({ conflictCount, admin }: { conflictCount: number; admin: boolean }) {
  const path = usePathname();
  const here = locate(path);
  const sub = here?.section.items.filter((i) => admin || !i.adminOnly) ?? [];
  return (
    <>
      {sub.length > 0 && (
        <nav className="bg-surface text-fg border-b border-line overflow-x-auto" aria-label={`${here!.section.label}: undersidor`}>
          <ul className="mx-auto flex max-w-[1500px] gap-1 px-4 min-w-max">
            {sub.map((i) => {
              const active = here?.item?.href === i.href;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg hover:border-line"
                    }`}
                  >
                    {i.label}
                    {i.href === "/krockar" && conflictCount > 0 && (
                      <span className="rounded-full bg-warn px-1.5 text-xs font-semibold text-white">{conflictCount}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}

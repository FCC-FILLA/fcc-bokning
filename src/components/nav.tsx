"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Översikt" },
  { href: "/vecka", label: "Vecka" },
  { href: "/manad", label: "Månad" },
  { href: "/dagsblad", label: "Dagsblad" },
  { href: "/ledigt", label: "Ledig lokal" },
  { href: "/evenemang", label: "Evenemang" },
  { href: "/offerter", label: "Offerter" },
  { href: "/mallar", label: "Mallar" },
  { href: "/kunder", label: "Kunder" },
  { href: "/lokaler", label: "Lokaler" },
  { href: "/prislista", label: "Prislista" },
  { href: "/krockar", label: "Krockar" },
];

export function Nav({ conflictCount, admin }: { conflictCount: number; admin: boolean }) {
  const path = usePathname();
  const items = admin ? [...ITEMS, { href: "/anvandare", label: "Användare" }] : ITEMS;
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Huvudmeny">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium font-display transition-colors ${
              active ? "bg-white/15 ring-1 ring-white/30" : "opacity-80 hover:opacity-100"
            }`}
          >
            {item.label}
            {item.href === "/krockar" && conflictCount > 0 && (
              <span className="ml-1.5 rounded-full bg-white text-brand px-1.5 text-xs font-semibold">{conflictCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

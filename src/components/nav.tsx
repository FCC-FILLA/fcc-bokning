"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Vecka" },
  { href: "/manad", label: "Månad" },
  { href: "/evenemang", label: "Evenemang" },
  { href: "/offerter", label: "Offerter" },
  { href: "/kunder", label: "Kunder" },
  { href: "/lokaler", label: "Lokaler" },
  { href: "/prislista", label: "Prislista" },
  { href: "/krockar", label: "Krockar" },
];

export function Nav({ conflictCount }: { conflictCount: number }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
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

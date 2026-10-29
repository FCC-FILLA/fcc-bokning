import { iconPaths } from "@/lib/ikoner";

/** Artikelikon som linjeteckning. Ärver textfärgen. */
export function ArticleIcon({ name, className = "size-12", strokeWidth = 2 }: { name: string | null | undefined; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {iconPaths(name).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

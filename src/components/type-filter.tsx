import Link from "next/link";
import { NO_TYPE, toggleType, type EventTypeInfo } from "@/lib/typer";

/** Tänd och släck evenemangstyper i kalendern. */
export function TypeFilter({ types, hidden, href }: { types: EventTypeInfo[]; hidden: Set<string>; href: (dolj: string) => string }) {
  const all = [...types, { id: NO_TYPE, name: "Utan typ", color: "#9a9a9a" }];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Visa evenemangstyper">
      {all.map((t) => {
        const on = !hidden.has(t.id);
        return (
          <Link
            key={t.id}
            href={href(toggleType(hidden, t.id))}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors ${on ? "border-line bg-surface" : "border-dashed border-line text-muted line-through opacity-70"}`}
          >
            <span className="size-2.5 rounded-full" style={{ background: on ? t.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${t.color}` }} />
            {t.name}
          </Link>
        );
      })}
      {hidden.size > 0 && <Link href={href("")} className="ml-1 text-muted underline-offset-2 hover:underline">Visa alla</Link>}
    </div>
  );
}

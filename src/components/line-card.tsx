import { fmtDate } from "@/lib/datum";
import { fmtKr, lineTotal } from "@/lib/offert";
import type { QuoteDoc } from "@/lib/offert-doc";
import { Gallery } from "@/components/gallery";
import { ArticleIcon } from "@/components/icon";

export /** En offertrad som kort: bild (med bildspel) eller ikon till vänster, text och pris till höger. */
function LineCard({ line: l, as: Tag = "li" }: { line: QuoteDoc["lines"][number]; as?: "li" | "div" }) {
  const images = l.image ? [l.image, ...l.gallery.filter((g) => g !== l.image)] : [];
  return (
    <Tag className="card overflow-hidden grid grid-cols-[112px_1fr] sm:grid-cols-[128px_1fr] min-h-32">
      <div className="relative bg-sunk text-fg flex items-center justify-center">
        {images.length ? <Gallery images={images} alt={l.description} sizes="128px" /> : <ArticleIcon name={l.icon} className="size-16" strokeWidth={1.8} />}
      </div>
      <div className="p-4 grid gap-1 content-between min-w-0">
        <div className="grid gap-1">
          <p className="font-semibold leading-snug">{l.description}</p>
          {l.line_date && <p className="text-xs text-muted">{fmtDate(l.line_date)}</p>}
          {l.text && <p className="text-sm text-muted leading-snug">{l.text}</p>}
        </div>
        <div className="mt-2 pt-2 border-t border-dashed border-line flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-xs text-muted tabular-nums">
            {l.quantity.toLocaleString("sv-SE")} {l.unit} × {fmtKr(l.unit_price)}
            {l.discount_pct ? <span className="ml-1 font-semibold text-ok">(−{l.discount_pct} %)</span> : null}
          </span>
          <span className="font-semibold text-brand tabular-nums">{fmtKr(lineTotal(l))}</span>
        </div>
      </div>
    </Tag>
  );
}


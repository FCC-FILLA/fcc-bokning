import { ArticleIcon } from "@/components/icon";

export type StaffInfoBlock = { id: string; title: string; body: string; icon: string | null };

/** "Bra att veta": kontorets info till personalen. */
export function StaffInfoBlocks({ blocks }: { blocks: StaffInfoBlock[] }) {
  if (!blocks.length) return <div className="card p-8 text-center text-muted">Ingen info just nu.</div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {blocks.map((b) => (
        <section key={b.id} className="card p-4 grid content-start gap-1.5">
          <h3 className="flex items-center gap-2 font-semibold"><span className="text-brand"><ArticleIcon name={b.icon} className="size-5" /></span>{b.title}</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed">{b.body}</p>
        </section>
      ))}
    </div>
  );
}

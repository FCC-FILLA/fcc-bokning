import Link from "next/link";
import { canBook, requireProfile } from "@/lib/auth";
import { getLookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { createTemplate } from "./actions";

export const metadata = { title: "Mallar" };

type Row = {
  id: string;
  name: string;
  description: string | null;
  event_type_id: string | null;
  template_bookings: { count: number }[];
  template_lines: { count: number }[];
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const lookups = await getLookups();
  const { data } = await supabase.from("event_templates").select("id, name, description, event_type_id, template_bookings(count), template_lines(count)").order("name");
  const templates = (data ?? []) as Row[];
  const typeName = new Map(lookups.eventTypes.map((t) => [t.id, t.name]));

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Mallar</h1>
        <p className="text-sm text-muted max-w-2xl">
          En mall är ett återkommande upplägg: lokaler och tider dag för dag, plus offertrader. Skapa ett nytt evenemang från
          mallen på några sekunder. Du kan också spara ett befintligt evenemang som mall längst ner på evenemangssidan.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      {templates.length === 0 ? (
        <div className="card p-8 text-center text-muted">Inga mallar ännu.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/mallar/${t.id}`} className="card p-4 grid gap-1 hover:border-muted h-full">
                <span className="font-semibold">{t.name}</span>
                {t.description && <span className="text-sm text-muted line-clamp-2">{t.description}</span>}
                <span className="text-xs text-muted">
                  {t.event_type_id ? `${typeName.get(t.event_type_id)} · ` : ""}
                  {t.template_bookings?.[0]?.count ?? 0} lokaltider · {t.template_lines?.[0]?.count ?? 0} offertrader
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canBook(profile) && (
        <form action={createTemplate} className="card p-5 flex flex-wrap items-end gap-3">
          <div className="field grow min-w-60">
            <label className="label" htmlFor="name">Ny mall</label>
            <input className="input" id="name" name="name" required placeholder="T.ex. Konsert i Stora salen" />
          </div>
          <div className="field">
            <label className="label" htmlFor="event_type_id">Typ</label>
            <select className="input" id="event_type_id" name="event_type_id" defaultValue="">
              <option value="">Välj typ</option>
              {lookups.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">Skapa mall</button>
        </form>
      )}
    </div>
  );
}

import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveSetting } from "../../prislista/actions";

export const metadata = { title: "Offerttexter" };

const FIELDS = [
  { key: "quote_intro", label: "Inledning", help: "Visas överst i varje ny offert." },
  { key: "quote_terms", label: "Villkor", help: "Kopieras in i varje ny offert och kan ändras per offert." },
  { key: "quote_valid_days", label: "Giltighet i dagar", help: "Hur länge en ny offert gäller från att den skapas." },
];

export default async function QuoteTextsPage({ searchParams }: { searchParams: Promise<{ sparad?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const settings = new Map(((data ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));

  return (
    <div className="grid gap-5 max-w-3xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Offerttexter</h1>
        <p className="text-sm text-muted">Standardtexter som följer med när en ny offert skapas. Ändringar påverkar inte offerter som redan finns.</p>
      </div>
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {!admin && <p className="text-sm text-muted">Bara administratörer kan ändra texterna.</p>}
      {FIELDS.map((x) => (
        <form key={x.key} action={saveSetting.bind(null, x.key)} className="card p-5 grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">{x.label}</h2>
            <p className="text-sm text-muted">{x.help}</p>
          </div>
          {x.key === "quote_valid_days" ? (
            <input className="input w-32" name="value" type="number" min={1} defaultValue={settings.get(x.key) ?? "30"} disabled={!admin} aria-label={x.label} />
          ) : (
            <textarea className="input min-h-40" name="value" defaultValue={settings.get(x.key) ?? ""} disabled={!admin} aria-label={x.label} />
          )}
          {admin && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
        </form>
      ))}
    </div>
  );
}

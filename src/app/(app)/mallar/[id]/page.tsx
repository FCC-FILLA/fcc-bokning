import Link from "next/link";
import { notFound } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { addDays, todayDate } from "@/lib/datum";
import { depthOf } from "@/lib/lokaler";
import { getLookups } from "@/lib/lookups";
import { fmtKr, quoteTotals } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, STATUS_LABEL, type Article, type ArticleGroup } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { QuoteEditor } from "@/components/quote-editor";
import { TemplateRows } from "@/components/template-rows";
import { createEventFromTemplate, deleteTemplate, saveTemplate } from "../actions";

type Tpl = {
  id: string; name: string; description: string | null; event_type_id: string | null; participants: number | null;
  technical_info: string | null; hospitality_info: string | null;
};

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparad?: string; skapad?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const booker = canBook(profile);
  const supabase = await createClient();
  const [{ data: t }, { data: rows }, { data: lines }, { data: g }, { data: a }, lookups] = await Promise.all([
    supabase.from("event_templates").select("*").eq("id", id).maybeSingle(),
    supabase.from("template_bookings").select("*").eq("template_id", id).order("sort_order"),
    supabase.from("template_lines").select("*").eq("template_id", id).order("sort_order"),
    supabase.from("article_groups").select("*").order("sort_order"),
    supabase.from("articles").select("id, article_no, name, group_id, unit, price, cost, vat_rate").eq("active", true).order("sort_order"),
    getLookups(),
  ]);
  if (!t) notFound();
  const tpl = t as Tpl;
  const groups = (g ?? []) as ArticleGroup[];
  const articles = (a ?? []) as Article[];
  const initialLines = ((lines ?? []) as Record<string, unknown>[]).map((l) => ({
    group_id: l.group_id as string,
    article_id: (l.article_id as string) ?? null,
    description: l.description as string,
    line_date: "",
    quantity: Number(l.quantity),
    unit: l.unit as string,
    unit_price: Number(l.unit_price),
    cost: Number(l.cost),
    discount_pct: Number(l.discount_pct),
    vat_rate: Number(l.vat_rate),
    kind: l.kind as "ingar" | "tillval",
  }));
  const totals = quoteTotals(initialLines);
  const days = Math.max(1, ...((rows ?? []) as { day_offset: number }[]).map((r) => r.day_offset + 1));
  const rooms = lookups.rooms.filter((r) => r.bookable).map((r) => ({ id: r.id, name: r.name, depth: depthOf(lookups.rooms, r.id) }));

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-2">
        <Link href="/mallar" className="text-sm text-muted hover:underline">← Mallar</Link>
        <h1 className="text-2xl font-semibold">{tpl.name}</h1>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Mallen är sparad.</p>}
      {sp.skapad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Mallen är skapad från evenemanget. Kontrollera tider och rader och spara.</p>}

      {booker && (
        <form action={createEventFromTemplate.bind(null, id)} className="card p-5 grid gap-4 border-l-4 border-l-brand">
          <div>
            <h2 className="text-lg font-semibold">Skapa evenemang från mallen</h2>
            <p className="text-sm text-muted">
              {(rows ?? []).length} lokaltider över {days} dag{days === 1 ? "" : "ar"}
              {initialLines.length ? `, ${initialLines.length} offertrader (${fmtKr(totals.exVat)} exkl. moms)` : ""}. Dag 1 blir startdatumet.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr] items-end">
            <div className="field"><label className="label" htmlFor="new-title">Namn på evenemanget</label><input className="input" id="new-title" name="title" required defaultValue={tpl.name} /></div>
            <div className="field"><label className="label" htmlFor="new-start">Startdatum</label><input className="input" id="new-start" name="start_date" type="date" required defaultValue={addDays(todayDate(), 14)} /></div>
            <div className="field">
              <label className="label" htmlFor="new-company">Kund</label>
              <select className="input" id="new-company" name="company_id" defaultValue="">
                <option value="">Ingen kund ännu</option>
                {lookups.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="new-status">Status</label>
              <select className="input" id="new-status" name="status" defaultValue="forfragan">
                {STATUSES.filter((s) => s !== "genomford" && s !== "avbokad").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {initialLines.length > 0 && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="with_quote" defaultChecked /> Skapa offertutkast med mallens rader</label>
            )}
            <button className="btn btn-primary" type="submit">Skapa evenemang</button>
          </div>
        </form>
      )}

      <form action={saveTemplate.bind(null, id)} className="grid gap-5">
        <fieldset disabled={!booker} className="card p-5 grid gap-4">
          <h2 className="text-lg font-semibold">Uppgifter</h2>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="field"><label className="label" htmlFor="name">Namn</label><input className="input" id="name" name="name" required defaultValue={tpl.name} /></div>
            <div className="field">
              <label className="label" htmlFor="event_type_id">Typ</label>
              <select className="input" id="event_type_id" name="event_type_id" defaultValue={tpl.event_type_id ?? ""}>
                <option value="">Välj typ</option>
                {lookups.eventTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field"><label className="label" htmlFor="participants">Deltagare</label><input className="input" id="participants" name="participants" type="number" min={0} defaultValue={tpl.participants ?? ""} /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="field"><label className="label" htmlFor="description">Beskrivning</label><textarea className="input" id="description" name="description" defaultValue={tpl.description ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="technical_info">Teknik</label><textarea className="input" id="technical_info" name="technical_info" defaultValue={tpl.technical_info ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="hospitality_info">Mat och hospitality</label><textarea className="input" id="hospitality_info" name="hospitality_info" defaultValue={tpl.hospitality_info ?? ""} /></div>
          </div>
        </fieldset>

        <section className="card p-5 grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">Lokaler och tider</h2>
            <p className="text-sm text-muted">Dag 1 är evenemangets första dag. Ta med bygg och riv.</p>
          </div>
          <TemplateRows
            rooms={rooms}
            setups={lookups.setups.map((s) => ({ id: s.id, name: s.name }))}
            readOnly={!booker}
            initial={((rows ?? []) as Record<string, unknown>[]).map((r) => ({
              day: Number(r.day_offset) + 1,
              room_id: r.room_id as string,
              from: String(r.start_time).slice(0, 5),
              to: String(r.end_time).slice(0, 5),
              setup_id: (r.setup_id as string) ?? "",
              note: (r.note as string) ?? "",
              phase: (r.phase as string) ?? "genomforande",
            }))}
          />
        </section>

        <section className="card p-5 grid gap-3">
          <h2 className="text-lg font-semibold">Offertrader</h2>
          <QuoteEditor
            groups={groups.map((x) => ({ id: x.id, name: x.name }))}
            articles={articles.map((x) => ({ ...x, price: x.price == null ? null : Number(x.price), cost: Number(x.cost), vat_rate: Number(x.vat_rate) }))}
            initial={initialLines}
            readOnly={!booker}
            submitLabel="Spara mallen"
            hideDates
          />
        </section>
      </form>

      {booker && (
        <form action={deleteTemplate.bind(null, id)}>
          <ConfirmButton label="Ta bort mallen" question="Mallen tas bort. Evenemang som skapats från den påverkas inte." confirmLabel="Ta bort" />
        </form>
      )}
    </div>
  );
}

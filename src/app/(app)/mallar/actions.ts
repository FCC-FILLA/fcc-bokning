"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBooker } from "@/lib/auth";
import { addDays, todayDate } from "@/lib/datum";
import { bookingsFromTemplate, templateFromBookings, type TemplateBooking } from "@/lib/mall";
import { createClient } from "@/lib/supabase/server";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const fail = (path: string, msg: string): never => redirect(`${path}?fel=${encodeURIComponent(msg)}`);
const UUID = /^[0-9a-f-]{36}$/i;
const TIME = /^\d{2}:\d{2}$/;

function parseTemplateRows(json: string | null): TemplateBooking[] {
  try {
    const arr = JSON.parse(json ?? "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r) => UUID.test(String(r.room_id)) && TIME.test(String(r.from)) && TIME.test(String(r.to)))
      .map((r) => ({
        day_offset: Math.min(60, Math.max(0, (Number(r.day) || 1) - 1)),
        room_id: String(r.room_id),
        start_time: String(r.from),
        end_time: String(r.to),
        setup_id: r.setup_id ? String(r.setup_id) : null,
        note: r.note ? String(r.note).slice(0, 500) : null,
        phase: ["bygg", "genomforande", "riv"].includes(String(r.phase)) ? String(r.phase) : "genomforande",
      }));
  } catch {
    return [];
  }
}

function parseLines(json: string | null) {
  try {
    const arr = JSON.parse(json ?? "[]");
    if (!Array.isArray(arr)) return [];
    const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    return arr.map((l: Record<string, unknown>, i: number) => ({
      group_id: String(l.group_id || "ovrigt"),
      article_id: l.article_id ? String(l.article_id) : null,
      description: String(l.description ?? "").trim().slice(0, 500) || "Rad",
      quantity: n(l.quantity, 1),
      unit: String(l.unit || "st").slice(0, 20),
      unit_price: n(l.unit_price),
      cost: n(l.cost),
      discount_pct: Math.min(100, Math.max(0, n(l.discount_pct))),
      vat_rate: n(l.vat_rate, 25),
      kind: l.kind === "tillval" ? "tillval" : "ingar",
      sort_order: i,
    }));
  } catch {
    return [];
  }
}

export async function createTemplate(fd: FormData) {
  await requireBooker();
  const name = opt(fd.get("name"));
  if (!name) fail("/mallar", "Ge mallen ett namn.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_templates").insert({ name, event_type_id: opt(fd.get("event_type_id")) }).select("id").single();
  if (error || !data) fail("/mallar", "Det gick inte att skapa mallen.");
  revalidatePath("/mallar");
  redirect(`/mallar/${data!.id}`);
}

export async function saveTemplate(id: string, fd: FormData) {
  await requireBooker();
  const name = opt(fd.get("name"));
  if (!name) fail(`/mallar/${id}`, "Ge mallen ett namn.");
  const supabase = await createClient();
  const participants = opt(fd.get("participants"));
  await supabase
    .from("event_templates")
    .update({
      name,
      description: opt(fd.get("description")),
      event_type_id: opt(fd.get("event_type_id")),
      participants: participants ? Math.max(0, Number(participants) || 0) : null,
      technical_info: opt(fd.get("technical_info")),
      hospitality_info: opt(fd.get("hospitality_info")),
    })
    .eq("id", id);
  const rows = parseTemplateRows(opt(fd.get("template_rows")));
  const lines = parseLines(opt(fd.get("lines")));
  await supabase.from("template_bookings").delete().eq("template_id", id);
  await supabase.from("template_lines").delete().eq("template_id", id);
  if (rows.length) await supabase.from("template_bookings").insert(rows.map((r, i) => ({ ...r, template_id: id, sort_order: i })));
  if (lines.length) await supabase.from("template_lines").insert(lines.map((l) => ({ ...l, template_id: id })));
  revalidatePath(`/mallar/${id}`);
  revalidatePath("/mallar");
  redirect(`/mallar/${id}?sparad=1`);
}

export async function deleteTemplate(id: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("event_templates").delete().eq("id", id);
  revalidatePath("/mallar");
  redirect("/mallar");
}

/** Nytt evenemang (och gärna ett offertutkast) från en mall. */
export async function createEventFromTemplate(id: string, fd: FormData) {
  const profile = await requireBooker();
  const title = opt(fd.get("title"));
  const start = opt(fd.get("start_date"));
  if (!title || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) fail(`/mallar/${id}`, "Ange namn och startdatum för evenemanget.");
  const supabase = await createClient();
  const [{ data: tpl }, { data: rows }, { data: lines }] = await Promise.all([
    supabase.from("event_templates").select("*").eq("id", id).single(),
    supabase.from("template_bookings").select("*").eq("template_id", id).order("sort_order"),
    supabase.from("template_lines").select("*").eq("template_id", id).order("sort_order"),
  ]);
  if (!tpl) redirect("/mallar");
  const company_id = opt(fd.get("company_id"));
  const { data: ev, error } = await supabase
    .from("events")
    .insert({
      title,
      status: opt(fd.get("status")) ?? "forfragan",
      event_type_id: tpl.event_type_id,
      company_id,
      responsible_id: profile.id,
      participants: tpl.participants,
      technical_info: tpl.technical_info,
      hospitality_info: tpl.hospitality_info,
      description: tpl.description,
    })
    .select("id")
    .single();
  if (error || !ev) fail(`/mallar/${id}`, "Det gick inte att skapa evenemanget.");
  if (rows?.length) await supabase.from("bookings").insert(bookingsFromTemplate(rows as TemplateBooking[], start!, ev!.id));

  if (fd.get("with_quote") === "on" && lines?.length) {
    const { data: s } = await supabase.from("app_settings").select("key, value");
    const settings = new Map(((s ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));
    const { data: q } = await supabase
      .from("quotes")
      .insert({
        title,
        event_id: ev!.id,
        company_id,
        salesperson_id: profile.id,
        valid_until: addDays(todayDate(), Number(settings.get("quote_valid_days") ?? 30) || 30),
        intro: settings.get("quote_intro") ?? null,
        terms: settings.get("quote_terms") ?? null,
      })
      .select("id")
      .single();
    if (q) {
      await supabase.from("quote_lines").insert(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        lines.map(({ id: _i, template_id: _t, ...l }) => ({ ...l, quote_id: q.id })),
      );
    }
  }
  revalidatePath("/", "layout");
  redirect(`/evenemang/${ev!.id}?franmall=1`);
}

/** Spara ett befintligt evenemangs lokaler, tider och (senaste offertens) rader som mall. */
export async function saveEventAsTemplate(eventId: string, fd: FormData) {
  await requireBooker();
  const name = opt(fd.get("name"));
  if (!name) redirect(`/evenemang/${eventId}?fel=${encodeURIComponent("Ge mallen ett namn.")}`);
  const supabase = await createClient();
  const [{ data: ev }, { data: bookings }, { data: quote }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("bookings").select("room_id, starts_at, ends_at, setup_id, note, phase").eq("event_id", eventId).order("starts_at").limit(1000),
    supabase.from("quotes").select("id").eq("event_id", eventId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!ev) redirect("/evenemang");
  const { data: tpl } = await supabase
    .from("event_templates")
    .insert({
      name,
      description: ev.description,
      event_type_id: ev.event_type_id,
      participants: ev.participants,
      technical_info: ev.technical_info,
      hospitality_info: ev.hospitality_info,
    })
    .select("id")
    .single();
  if (!tpl) redirect(`/evenemang/${eventId}?fel=${encodeURIComponent("Det gick inte att spara mallen.")}`);
  const rows = templateFromBookings(bookings ?? []);
  if (rows.length) await supabase.from("template_bookings").insert(rows.map((r, i) => ({ ...r, template_id: tpl!.id, sort_order: i })));
  if (quote) {
    const { data: ql } = await supabase.from("quote_lines").select("*").eq("quote_id", quote.id).order("sort_order");
    if (ql?.length) {
      await supabase.from("template_lines").insert(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ql.map(({ id: _i, quote_id: _q, line_date: _d, ...l }) => ({ ...l, template_id: tpl!.id })),
      );
    }
  }
  revalidatePath("/mallar");
  redirect(`/mallar/${tpl!.id}?skapad=1`);
}

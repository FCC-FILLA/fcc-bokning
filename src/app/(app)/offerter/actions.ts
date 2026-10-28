"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBooker } from "@/lib/auth";
import { addDays, isoToDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import type { Article } from "@/lib/types";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const fail = (path: string, msg: string): never => redirect(`${path}?fel=${encodeURIComponent(msg)}`);

async function settings() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  return new Map(((data ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));
}

/** Rader för lokalerna i ett evenemang: en rad per bokning, med pris från prislistan när lokalen har en artikel. */
async function linesFromBookings(eventId: string, quoteId: string, startOrder = 0) {
  const supabase = await createClient();
  const [{ data: bookings }, { data: articles }, { data: rooms }] = await Promise.all([
    supabase.from("bookings").select("room_id, starts_at").eq("event_id", eventId).order("starts_at"),
    supabase.from("articles").select("*").eq("active", true).not("room_id", "is", null),
    supabase.from("rooms").select("id, name"),
  ]);
  const byRoom = new Map(((articles ?? []) as Article[]).map((a) => [a.room_id!, a]));
  const roomName = new Map(((rooms ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  return (bookings ?? []).map((b, i) => {
    const a = byRoom.get(b.room_id);
    return {
      quote_id: quoteId,
      group_id: "lokal",
      article_id: a?.id ?? null,
      description: a?.name ?? roomName.get(b.room_id) ?? "Lokal",
      line_date: isoToDate(b.starts_at),
      quantity: 1,
      unit: a?.unit ?? "dag",
      unit_price: a?.price ?? 0,
      cost: a?.cost ?? 0,
      discount_pct: 0,
      vat_rate: a?.vat_rate ?? 25,
      kind: "ingar",
      sort_order: startOrder + i,
    };
  });
}

export async function createQuote(fd: FormData) {
  const profile = await requireBooker();
  const eventId = opt(fd.get("event_id"));
  const title = opt(fd.get("title"));
  if (!title) fail("/offerter/ny", "Ge offerten en rubrik.");
  const supabase = await createClient();
  const s = await settings();

  let company_id = opt(fd.get("company_id"));
  let contact_id: string | null = null;
  if (eventId) {
    const { data: ev } = await supabase.from("events").select("company_id, contact_id").eq("id", eventId).single();
    company_id = company_id ?? ev?.company_id ?? null;
    contact_id = ev?.contact_id ?? null;
  }
  const days = Number(s.get("quote_valid_days") ?? 30) || 30;
  const { data: q, error } = await supabase
    .from("quotes")
    .insert({
      title,
      event_id: eventId,
      company_id,
      contact_id,
      salesperson_id: profile.id,
      valid_until: addDays(todayDate(), days),
      intro: s.get("quote_intro") ?? null,
      terms: s.get("quote_terms") ?? null,
    })
    .select("id")
    .single();
  if (error || !q) fail("/offerter/ny", "Det gick inte att skapa offerten.");

  if (eventId && fd.get("from_bookings") === "on") {
    const lines = await linesFromBookings(eventId, q!.id);
    if (lines.length) await supabase.from("quote_lines").insert(lines);
  }
  revalidatePath("/offerter");
  redirect(`/offerter/${q!.id}`);
}

export async function updateQuote(id: string, fd: FormData) {
  await requireBooker();
  const title = opt(fd.get("title"));
  if (!title) fail(`/offerter/${id}`, "Ge offerten en rubrik.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      title,
      company_id: opt(fd.get("company_id")),
      contact_id: opt(fd.get("contact_id")),
      salesperson_id: opt(fd.get("salesperson_id")),
      event_id: opt(fd.get("event_id")),
      valid_until: opt(fd.get("valid_until")),
      intro: opt(fd.get("intro")),
      terms: opt(fd.get("terms")),
    })
    .eq("id", id);
  revalidatePath(`/offerter/${id}`);
  redirect(`/offerter/${id}?${error ? `fel=${encodeURIComponent("Det gick inte att spara.")}` : "sparat=1"}`);
}

type LineInput = {
  group_id: string;
  article_id: string | null;
  description: string;
  line_date: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number;
  discount_pct: number;
  vat_rate: number;
  kind: "ingar" | "tillval";
};

function parseLines(json: string | null): LineInput[] | null {
  try {
    const arr = JSON.parse(json ?? "[]");
    if (!Array.isArray(arr)) return null;
    const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    return arr.map((l: Record<string, unknown>) => ({
      group_id: String(l.group_id || "ovrigt"),
      article_id: l.article_id ? String(l.article_id) : null,
      description: String(l.description ?? "").trim().slice(0, 500) || "Rad",
      line_date: /^\d{4}-\d{2}-\d{2}$/.test(String(l.line_date ?? "")) ? String(l.line_date) : null,
      quantity: n(l.quantity, 1),
      unit: String(l.unit || "st").slice(0, 20),
      unit_price: n(l.unit_price),
      cost: n(l.cost),
      discount_pct: Math.min(100, Math.max(0, n(l.discount_pct))),
      vat_rate: n(l.vat_rate, 25),
      kind: l.kind === "tillval" ? "tillval" : "ingar",
    }));
  } catch {
    return null;
  }
}

/** Sparar alla rader på en gång (ersätter de gamla). */
export async function saveLines(id: string, fd: FormData) {
  await requireBooker();
  const lines = parseLines(opt(fd.get("lines")));
  if (!lines) fail(`/offerter/${id}`, "Raderna kunde inte läsas. Ladda om sidan och försök igen.");
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("status").eq("id", id).single();
  if (q?.status === "accepterad") fail(`/offerter/${id}`, "En accepterad offert kan inte ändras. Gör en kopia i stället.");
  await supabase.from("quote_lines").delete().eq("quote_id", id);
  if (lines!.length) {
    const { error } = await supabase.from("quote_lines").insert(lines!.map((l, i) => ({ ...l, quote_id: id, sort_order: i })));
    if (error) fail(`/offerter/${id}`, "Det gick inte att spara raderna.");
  }
  await supabase.from("quotes").update({ updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/offerter/${id}`);
  revalidatePath("/offerter");
  redirect(`/offerter/${id}?sparat=rader#rader`);
}

export async function addBookingLines(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("event_id").eq("id", id).single();
  if (!q?.event_id) fail(`/offerter/${id}`, "Offerten är inte kopplad till något evenemang.");
  const { count } = await supabase.from("quote_lines").select("id", { count: "exact", head: true }).eq("quote_id", id);
  const lines = await linesFromBookings(q!.event_id!, id, count ?? 0);
  if (!lines.length) fail(`/offerter/${id}`, "Evenemanget har inga bokningar.");
  await supabase.from("quote_lines").insert(lines);
  revalidatePath(`/offerter/${id}`);
  redirect(`/offerter/${id}?sparat=rader#rader`);
}

export async function markSent(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { count } = await supabase.from("quote_lines").select("id", { count: "exact", head: true }).eq("quote_id", id);
  if (!count) fail(`/offerter/${id}`, "Lägg till minst en rad innan offerten skickas.");
  await supabase.from("quotes").update({ status: "skickad", sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/offerter/${id}`);
  redirect(`/offerter/${id}?skickad=1`);
}

export async function backToDraft(id: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("quotes").update({ status: "utkast" }).eq("id", id).eq("status", "skickad");
  revalidatePath(`/offerter/${id}`);
  redirect(`/offerter/${id}`);
}

/** När kunden svarat på annat sätt (mejl, telefon). */
export async function registerAnswer(id: string, accepted: boolean) {
  const profile = await requireBooker();
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("quotes")
    .update({
      status: accepted ? "accepterad" : "avbojd",
      accepted_at: accepted ? now : null,
      declined_at: accepted ? null : now,
      accepted_name: `Registrerat av ${profile.full_name || profile.email}`,
    })
    .eq("id", id);
  revalidatePath(`/offerter/${id}`);
  redirect(`/offerter/${id}`);
}

export async function confirmEvent(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("event_id").eq("id", id).single();
  if (q?.event_id) await supabase.from("events").update({ status: "bekraftad" }).eq("id", q.event_id);
  revalidatePath("/", "layout");
  redirect(`/offerter/${id}?bekraftad=1`);
}

export async function duplicateQuote(id: string) {
  const profile = await requireBooker();
  const supabase = await createClient();
  const [{ data: q }, { data: lines }] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).single(),
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
  ]);
  if (!q) redirect("/offerter");
  const s = await settings();
  const { data: copy } = await supabase
    .from("quotes")
    .insert({
      title: `${q.title} (kopia)`,
      event_id: q.event_id,
      company_id: q.company_id,
      contact_id: q.contact_id,
      salesperson_id: profile.id,
      valid_until: addDays(todayDate(), Number(s.get("quote_valid_days") ?? 30) || 30),
      intro: q.intro,
      terms: q.terms,
    })
    .select("id")
    .single();
  if (!copy) fail(`/offerter/${id}`, "Det gick inte att kopiera offerten.");
  if (lines?.length) {
    await supabase.from("quote_lines").insert(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      lines.map(({ id: _id, quote_id: _q, ...l }) => ({ ...l, quote_id: copy!.id })),
    );
  }
  revalidatePath("/offerter");
  redirect(`/offerter/${copy!.id}?kopierad=1`);
}

export async function deleteQuote(id: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("quotes").delete().eq("id", id);
  revalidatePath("/offerter");
  redirect("/offerter");
}

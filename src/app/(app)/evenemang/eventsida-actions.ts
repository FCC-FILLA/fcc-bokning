"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canBook, canManageStaff, requireProfile } from "@/lib/auth";
import { addDays, isoToDate } from "@/lib/datum";
import { kickMail } from "@/lib/epost";
import { createClient } from "@/lib/supabase/server";

async function requireEditor() {
  const p = await requireProfile();
  if (!canBook(p) && !canManageStaff(p)) throw new Error("Ingen behörighet.");
  return p;
}
const back = (id: string, q = "") => redirect(`/evenemang/${id}${q ? `?${q}` : ""}#eventsida`);
const done = (id: string, q = "") => {
  revalidatePath(`/evenemang/${id}`);
  back(id, q);
};

export async function setPortalEnabled(eventId: string, enabled: boolean) {
  await requireEditor();
  const supabase = await createClient();
  await supabase.from("events").update({ portal_enabled: enabled }).eq("id", eventId);
  done(eventId);
}

/** Lägger en mejlinbjudan till kundens kontaktperson (eller kundens e-post) i kön. */
export async function sendPortalLink(eventId: string, fd: FormData) {
  await requireEditor();
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("title, share_token, contact_id, company_id, contacts(name, email), companies(email)").eq("id", eventId).single();
  const e = ev as unknown as { title: string; share_token: string; contacts: { name: string; email: string | null } | null; companies: { email: string | null } | null } | null;
  const to = String(fd.get("to") ?? "").trim() || e?.contacts?.email || e?.companies?.email || "";
  if (!e || !/^\S+@\S+\.\S+$/.test(to)) back(eventId, `fel=${encodeURIComponent("Ange en e-postadress till kunden.")}`);
  const { data: site } = await supabase.from("app_settings").select("value").eq("key", "site_url").maybeSingle();
  const name = e!.contacts?.name?.split(" ")[0];
  await supabase.from("email_outbox").insert({
    to_email: to,
    to_name: e!.contacts?.name ?? null,
    subject: `Er sida för ${e!.title}`,
    body: `Hej${name ? ` ${name}` : ""}!\n\nHär är er sida för ${e!.title} hos Filadelfia Convention Center. Där hittar ni program och tider, offerter, en checklista inför evenemanget och dokument från oss.\n\nSpara gärna länken.\n\nVarma hälsningar\nFiladelfia Convention Center`,
    link: `${site?.value ?? "https://fcc-bokning.vercel.app"}/event/${e!.share_token}`,
    kind: "eventsida",
    event_id: eventId,
  });
  await kickMail();
  done(eventId, "skickad=1");
}

export async function addChecklistItem(eventId: string, fd: FormData) {
  await requireEditor();
  const title = String(fd.get("title") ?? "").trim();
  if (!title) back(eventId, `fel=${encodeURIComponent("Skriv vad som ska göras.")}`);
  const due = String(fd.get("due_date") ?? "");
  const supabase = await createClient();
  await supabase.from("event_checklist").insert({
    event_id: eventId,
    title: title.slice(0, 200),
    note: String(fd.get("note") ?? "").trim() || null,
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    customer_visible: fd.get("customer_visible") === "on",
    customer_can_check: fd.get("customer_can_check") === "on",
    sort_order: 999,
  });
  done(eventId);
}

/** Standardpunkterna från inställningarna, med datum räknat bakåt från evenemangets första dag. */
export async function addDefaultChecklist(eventId: string) {
  await requireEditor();
  const supabase = await createClient();
  const [{ data: setting }, { data: first }, { data: existing }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "checklist_default").maybeSingle(),
    supabase.from("bookings").select("starts_at").eq("event_id", eventId).order("starts_at").limit(1).maybeSingle(),
    supabase.from("event_checklist").select("title").eq("event_id", eventId),
  ]);
  const have = new Set(((existing ?? []) as { title: string }[]).map((x) => x.title));
  const start = first?.starts_at ? isoToDate(first.starts_at) : null;
  const rows = String(setting?.value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [d, ...rest] = l.includes("|") ? l.split("|") : ["", l];
      const days = Number(d);
      return {
        event_id: eventId,
        title: rest.join("|").trim(),
        due_date: start && Number.isFinite(days) && d !== "" ? addDays(start, -days) : null,
        sort_order: i,
      };
    })
    .filter((r) => r.title && !have.has(r.title));
  if (rows.length) await supabase.from("event_checklist").insert(rows);
  done(eventId);
}

export async function toggleChecklistItem(eventId: string, itemId: string, isDone: boolean) {
  const p = await requireEditor();
  const supabase = await createClient();
  await supabase.from("event_checklist").update({ done_at: isDone ? new Date().toISOString() : null, done_by: isDone ? p.full_name || p.email : null }).eq("id", itemId);
  done(eventId);
}

export async function deleteChecklistItem(eventId: string, itemId: string) {
  await requireEditor();
  const supabase = await createClient();
  await supabase.from("event_checklist").delete().eq("id", itemId);
  done(eventId);
}

/** Registrerar ett dokument som webbläsaren redan laddat upp till Storage. */
export async function registerDocument(eventId: string, path: string, name: string, mime: string, size: number) {
  await requireEditor();
  if (!path.startsWith(`${eventId}/`)) throw new Error("Fel sökväg.");
  const supabase = await createClient();
  await supabase.from("event_documents").insert({ event_id: eventId, storage_path: path, name: name.slice(0, 200), mime: mime.slice(0, 120), size_bytes: size });
  revalidatePath(`/evenemang/${eventId}`);
}

export async function setDocumentFlag(eventId: string, docId: string, field: "public" | "staff", value: boolean) {
  await requireEditor();
  const supabase = await createClient();
  await supabase.from("event_documents").update({ [field]: value }).eq("id", docId);
  done(eventId);
}

export async function deleteDocument(eventId: string, docId: string) {
  await requireEditor();
  const supabase = await createClient();
  const { data } = await supabase.from("event_documents").select("storage_path").eq("id", docId).single();
  if (data?.storage_path) await supabase.storage.from("dokument").remove([data.storage_path]);
  await supabase.from("event_documents").delete().eq("id", docId);
  done(eventId);
}

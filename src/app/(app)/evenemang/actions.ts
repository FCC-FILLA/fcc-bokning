"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { driveConfigured } from "@/lib/drive";
import { ensureEventFolder } from "@/lib/projektmapp";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBooker } from "@/lib/auth";
import { daysBetween, expandRows, minutes, parseRows, shiftIso } from "@/lib/bokning";
import { addDays, isoToDate, localToIso } from "@/lib/datum";
import { isPhase, retime, shiftMinutes } from "@/lib/serier";
import { createClient } from "@/lib/supabase/server";
import { kickMail } from "@/lib/epost";
import { STATUSES } from "@/lib/types";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

const EventSchema = z.object({
  title: z.string().min(1, "Ge evenemanget ett namn."),
  status: z.enum(STATUSES as [string, ...string[]]),
  event_type_id: z.string().nullable(),
  company_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  responsible_id: z.string().uuid().nullable(),
  participants: z.coerce.number().int().min(0).nullable(),
  option_expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().nullable(),
  technical_info: z.string().nullable(),
  hospitality_info: z.string().nullable(),
  staff_info: z.string().nullable(),
  internal_notes: z.string().nullable(),
});

function readEvent(fd: FormData) {
  const raw = {
    title: opt(fd.get("title")) ?? "",
    status: opt(fd.get("status")) ?? "forfragan",
    event_type_id: opt(fd.get("event_type_id")),
    company_id: opt(fd.get("company_id")),
    contact_id: opt(fd.get("contact_id")),
    responsible_id: opt(fd.get("responsible_id")),
    participants: opt(fd.get("participants")),
    option_expires_on: opt(fd.get("option_expires_on")),
    description: opt(fd.get("description")),
    technical_info: opt(fd.get("technical_info")),
    hospitality_info: opt(fd.get("hospitality_info")),
    staff_info: opt(fd.get("staff_info")),
    internal_notes: opt(fd.get("internal_notes")),
  };
  return EventSchema.safeParse(raw);
}

/** Ny kund och/eller ny kontaktperson som skapats direkt i evenemangsformuläret. Fyller i company_id/contact_id i formuläret. */
async function createCustomerInline(fd: FormData, back: string) {
  const supabase = await createClient();
  const newCompany = opt(fd.get("new_company_name"));
  if (newCompany && !opt(fd.get("company_id"))) {
    const { data, error } = await supabase.from("companies").insert({ name: newCompany }).select("id").single();
    if (error || !data) redirect(`${back}?fel=${encodeURIComponent("Det gick inte att skapa kunden.")}`);
    fd.set("company_id", data.id);
  }
  if (fd.get("contact_id") === "ny") {
    const name = opt(fd.get("new_contact_name"));
    if (!name) redirect(`${back}?fel=${encodeURIComponent("Den nya kontaktpersonen behöver ett namn.")}`);
    const { data, error } = await supabase
      .from("contacts")
      .insert({ name, email: opt(fd.get("new_contact_email")), phone: opt(fd.get("new_contact_phone")), company_id: opt(fd.get("company_id")) })
      .select("id")
      .single();
    if (error || !data) redirect(`${back}?fel=${encodeURIComponent("Det gick inte att skapa kontaktpersonen.")}`);
    fd.set("contact_id", data.id);
  }
}

function readBookings(fd: FormData, eventId: string) {
  const { rows, error } = parseRows(opt(fd.get("rows")));
  if (error) return { rows: [], error };
  const ph = fd.get("phase");
  const phase = isPhase(ph) ? ph : "genomforande";
  return { rows: expandRows(rows, Number(fd.get("repeat_weeks") ?? 1), eventId).map((r) => ({ ...r, phase })), error: null };
}

export async function createEvent(fd: FormData) {
  await requireBooker();
  if (!opt(fd.get("title"))) redirect(`/evenemang/ny?fel=${encodeURIComponent("Ge evenemanget ett namn.")}`);
  await createCustomerInline(fd, "/evenemang/ny");
  const parsed = readEvent(fd);
  if (!parsed.success) redirect(`/evenemang/ny?fel=${encodeURIComponent(parsed.error.issues[0].message)}`);

  const supabase = await createClient();
  const { data, error } = await supabase.from("events").insert(parsed.data).select("id").single();
  if (error) redirect(`/evenemang/ny?fel=${encodeURIComponent("Det gick inte att spara evenemanget.")}`);

  const { rows, error: bErr } = readBookings(fd, data.id);
  if (rows.length) {
    const { error: insErr } = await supabase.from("bookings").insert(rows);
    if (insErr) redirect(`/evenemang/${data.id}?fel=${encodeURIComponent("Evenemanget sparades men inte bokningen.")}`);
  }
  revalidatePath("/", "layout");
  redirect(`/evenemang/${data.id}${bErr ? `?fel=${encodeURIComponent(bErr)}` : "?sparat=1"}`);
}

export async function updateEvent(id: string, fd: FormData) {
  await requireBooker();
  await createCustomerInline(fd, `/evenemang/${id}`);
  const parsed = readEvent(fd);
  if (!parsed.success) redirect(`/evenemang/${id}?fel=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const supabase = await createClient();
  const { data: before } = await supabase.from("events").select("status, drive_folder_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("events").update(parsed.data).eq("id", id);
  // Projektmapp i Drive skapas när evenemanget blir bekräftat (efter svaret, så att sparandet inte väntar på Google).
  if (!error && parsed.data.status === "bekraftad" && before?.status !== "bekraftad" && !before?.drive_folder_id && driveConfigured()) {
    after(async () => { await ensureEventFolder(supabase, id); });
  }
  revalidatePath("/", "layout");
  redirect(`/evenemang/${id}?${error ? `fel=${encodeURIComponent("Det gick inte att spara.")}` : "sparat=1"}`);
}

export async function deleteEvent(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) redirect(`/evenemang/${id}?fel=${encodeURIComponent("Det gick inte att ta bort evenemanget.")}`);
  revalidatePath("/", "layout");
  redirect("/evenemang");
}

export async function addBookings(eventId: string, fd: FormData) {
  await requireBooker();
  const { rows, error } = readBookings(fd, eventId);
  if (error || !rows.length) redirect(`/evenemang/${eventId}?fel=${encodeURIComponent(error ?? "Välj lokal och tid.")}#bokningar`);
  const supabase = await createClient();
  const { error: insErr } = await supabase.from("bookings").insert(rows);
  revalidatePath("/", "layout");
  redirect(
    `/evenemang/${eventId}?${insErr ? `fel=${encodeURIComponent("Det gick inte att spara bokningen.")}` : `tillagt=${rows.length}`}#bokningar`,
  );
}

export async function deleteBooking(eventId: string, bookingId: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("bookings").delete().eq("id", bookingId).eq("event_id", eventId);
  revalidatePath("/", "layout");
  redirect(`/evenemang/${eventId}#bokningar`);
}

const back = (eventId: string, q: string) => redirect(`/evenemang/${eventId}?${q}#bokningar`);
const err = (msg: string) => `fel=${encodeURIComponent(msg)}`;

/** Ändra lokal, tid, möblering eller notering på en befintlig bokning. */
export async function updateBooking(eventId: string, bookingId: string, fd: FormData) {
  await requireBooker();
  const room_id = opt(fd.get("room_id"));
  const start = opt(fd.get("starts_at"));
  const end = opt(fd.get("ends_at"));
  if (!room_id || !start || !end) back(eventId, err("Ange lokal, start och slut."));
  const starts_at = localToIso(start!);
  const ends_at = localToIso(end!);
  if (ends_at <= starts_at) back(eventId, err("Sluttiden måste vara efter starttiden."));
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({
      room_id, starts_at, ends_at, setup_id: opt(fd.get("setup_id")), note: opt(fd.get("note")),
      ...(isPhase(fd.get("phase")) ? { phase: fd.get("phase") as string } : {}),
      rig_minutes: minutes(fd.get("rig_minutes")), strike_minutes: minutes(fd.get("strike_minutes")),
    })
    .eq("id", bookingId)
    .eq("event_id", eventId);
  revalidatePath("/", "layout");
  back(eventId, error ? err("Det gick inte att spara ändringen.") : "andrat=1");
}

/** Kopiera alla bokningar som börjar en viss dag till ett annat datum. */
export async function copyDay(eventId: string, fromDate: string, fd: FormData) {
  await requireBooker();
  const toDate = opt(fd.get("to_date"));
  if (!toDate || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) back(eventId, err("Välj ett datum att kopiera till."));
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("room_id, starts_at, ends_at, setup_id, note, phase, rig_minutes, strike_minutes")
    .eq("event_id", eventId)
    .gte("starts_at", localToIso(`${fromDate}T00:00`))
    .lt("starts_at", localToIso(`${addDays(fromDate, 1)}T00:00`));
  const offset = daysBetween(fromDate, toDate!);
  const rows = (data ?? []).map((b) => ({
    ...b,
    event_id: eventId,
    starts_at: shiftIso(b.starts_at, offset),
    ends_at: shiftIso(b.ends_at, offset),
  }));
  if (!rows.length) back(eventId, err("Det finns inga bokningar den dagen."));
  const { error } = await supabase.from("bookings").insert(rows);
  revalidatePath("/", "layout");
  back(eventId, error ? err("Det gick inte att kopiera dagen.") : `tillagt=${rows.length}`);
}

/** Skapa ett nytt evenemang med samma uppgifter och bokningar, flyttat till ett nytt startdatum. */
export async function duplicateEvent(eventId: string, fd: FormData) {
  await requireBooker();
  const newStart = opt(fd.get("new_start"));
  if (!newStart || !/^\d{4}-\d{2}-\d{2}$/.test(newStart)) redirect(`/evenemang/${eventId}?${err("Välj ett startdatum för kopian.")}`);
  const supabase = await createClient();
  const [{ data: ev }, { data: bookings }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("bookings").select("room_id, starts_at, ends_at, setup_id, note, phase, rig_minutes, strike_minutes").eq("event_id", eventId).order("starts_at"),
  ]);
  if (!ev) redirect("/evenemang");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, created_by, ...rest } = ev;
  const { data: copy, error } = await supabase
    .from("events")
    .insert({ ...rest, title: `${ev.title} (kopia)`, status: "forfragan", option_expires_on: null })
    .select("id")
    .single();
  if (error || !copy) redirect(`/evenemang/${eventId}?${err("Det gick inte att kopiera evenemanget.")}`);
  if (bookings?.length) {
    const offset = daysBetween(isoToDate(bookings[0].starts_at), newStart!);
    await supabase.from("bookings").insert(
      bookings.map((b) => ({
        ...b,
        event_id: copy.id,
        starts_at: shiftIso(b.starts_at, offset),
        ends_at: shiftIso(b.ends_at, offset),
      })),
    );
  }
  revalidatePath("/", "layout");
  redirect(`/evenemang/${copy.id}?kopierad=1`);
}

/** Flyttar ett evenemang upp eller ned i optionskön och numrerar om hela kön (1:a, 2:a …). */
export async function moveOption(eventId: string, targetId: string, dir: "upp" | "ned") {
  await requireBooker();
  const supabase = await createClient();
  const { data } = await supabase.rpc("option_queue", { p_event: eventId });
  const ids = ((data ?? []) as { event_id: string }[]).map((x) => x.event_id);
  const i = ids.indexOf(targetId);
  const j = dir === "upp" ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [n, id] of ids.entries()) await supabase.from("events").update({ option_rank: n + 1 }).eq("id", id);
  }
  revalidatePath("/", "layout");
  redirect(`/evenemang/${eventId}#optioner`);
}

/** Boknings-id från formuläret, högst 500 och bara giltiga uuid. */
function readIds(fd: FormData): string[] {
  let v: unknown[] = fd.getAll("id");
  if (!v.length) {
    try {
      const j = JSON.parse(String(fd.get("ids") ?? "[]"));
      v = Array.isArray(j) ? j : [];
    } catch {
      v = [];
    }
  }
  return v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
}

const TIME = /^\d{2}:\d{2}$/;

/** Ändra en hel serie: lokal, klockslag, fas, möblering och notering för alla dess bokningar. Datumen behålls. */
export async function updateSeries(eventId: string, fd: FormData) {
  await requireBooker();
  const ids = readIds(fd);
  const room_id = opt(fd.get("room_id"));
  const from = opt(fd.get("from"));
  const to = opt(fd.get("to"));
  const phase = fd.get("phase");
  if (!ids.length || !room_id || !from || !to || !TIME.test(from) || !TIME.test(to) || !isPhase(phase)) {
    back(eventId, err("Ange lokal, fas, start- och sluttid för serien."));
  }
  const supabase = await createClient();
  const { data } = await supabase.from("bookings").select("id, starts_at").eq("event_id", eventId).in("id", ids);
  const rows = data ?? [];
  const common = { room_id, setup_id: opt(fd.get("setup_id")), note: opt(fd.get("note")), phase: phase as string };
  const results = await Promise.all(
    rows.map((b) => supabase.from("bookings").update({ ...common, ...retime(b.starts_at, from!, to!) }).eq("id", b.id).eq("event_id", eventId)),
  );
  const failed = results.filter((r) => r.error).length;
  revalidatePath("/", "layout");
  back(eventId, failed ? err(`${failed} av ${rows.length} bokningar kunde inte ändras.`) : `andrat=${rows.length}&vy=serier`);
}

/** Ta bort alla bokningar i en serie, eller bara vissa datum ur den. */
export async function deleteSeries(eventId: string, fd: FormData) {
  await requireBooker();
  const ids = readIds(fd);
  if (!ids.length) back(eventId, err("Inga bokningar valda."));
  const supabase = await createClient();
  const { error, count } = await supabase.from("bookings").delete({ count: "exact" }).eq("event_id", eventId).in("id", ids);
  revalidatePath("/", "layout");
  back(eventId, error ? err("Det gick inte att ta bort bokningarna.") : `borttaget=${count ?? ids.length}&vy=serier`);
}

/**
 * Massändring av evenemangets bokningar som matchar ett urval (lokal, period, fas):
 * flytta i tid, byt fas eller ta bort.
 */
export async function bulkEditBookings(eventId: string, fd: FormData) {
  await requireBooker();
  const room = opt(fd.get("room_id"));
  const fromDate = opt(fd.get("from_date"));
  const toDate = opt(fd.get("to_date"));
  const onlyPhase = fd.get("only_phase");
  const action = String(fd.get("action") ?? "");
  const supabase = await createClient();

  let q = supabase.from("bookings").select("id, room_id, starts_at, ends_at").eq("event_id", eventId);
  if (room) q = q.eq("room_id", room);
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) q = q.gte("starts_at", localToIso(`${fromDate}T00:00`));
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) q = q.lt("starts_at", localToIso(`${addDays(toDate, 1)}T00:00`));
  if (isPhase(onlyPhase)) q = q.eq("phase", onlyPhase);
  const { data } = await q;
  const rows = data ?? [];
  if (!rows.length) back(eventId, err("Inga bokningar matchar urvalet.") + "&vy=serier");

  let failed = 0;
  if (action === "flytta") {
    const startMin = Number(fd.get("shift_start") ?? 0) || 0;
    const endMin = Number(fd.get("shift_end") ?? 0) || 0;
    if (!startMin && !endMin) back(eventId, err("Ange hur många minuter start eller slut ska flyttas.") + "&vy=serier");
    for (const b of rows) {
      const starts_at = shiftMinutes(b.starts_at, startMin);
      const ends_at = shiftMinutes(b.ends_at, endMin);
      if (ends_at <= starts_at) { failed++; continue; }
      const { error } = await supabase.from("bookings").update({ starts_at, ends_at }).eq("id", b.id).eq("event_id", eventId);
      if (error) failed++;
    }
  } else if (action === "fas") {
    const phase = fd.get("phase");
    if (!isPhase(phase)) back(eventId, err("Välj fas.") + "&vy=serier");
    const { error } = await supabase.from("bookings").update({ phase: phase as string }).eq("event_id", eventId).in("id", rows.map((r) => r.id));
    if (error) failed = rows.length;
  } else if (action === "ta-bort") {
    const { error } = await supabase.from("bookings").delete().eq("event_id", eventId).in("id", rows.map((r) => r.id));
    if (error) failed = rows.length;
  } else {
    back(eventId, err("Välj vad som ska göras.") + "&vy=serier");
  }
  revalidatePath("/", "layout");
  back(eventId, failed ? err(`${failed} av ${rows.length} bokningar kunde inte ändras.`) + "&vy=serier" : `andrat=${rows.length}&vy=serier`);
}

/** Skickar optionsmejlet till kundens kontakt nu (annars går det automatiskt några dagar före). */
export async function sendOptionReminder(eventId: string) {
  await requireBooker();
  const supabase = await createClient();
  const { data } = await supabase.rpc("send_option_reminder", { p_event: eventId });
  await kickMail();
  revalidatePath(`/evenemang/${eventId}`);
  redirect(`/evenemang/${eventId}?${data ? "optionskickad=1" : err("Det gick inte. Evenemanget behöver vara preliminärt, ha ett optionsdatum och en kontakt med e-post.")}`);
}

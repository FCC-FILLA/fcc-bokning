"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBooker } from "@/lib/auth";
import { daysBetween, expandRows, minutes, parseRows, shiftIso } from "@/lib/bokning";
import { addDays, isoToDate, localToIso } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
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
  return { rows: expandRows(rows, Number(fd.get("repeat_weeks") ?? 1), eventId), error: null };
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
  const { error } = await supabase.from("events").update(parsed.data).eq("id", id);
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
    .select("room_id, starts_at, ends_at, setup_id, note, rig_minutes, strike_minutes")
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
    supabase.from("bookings").select("room_id, starts_at, ends_at, setup_id, note, rig_minutes, strike_minutes").eq("event_id", eventId).order("starts_at"),
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

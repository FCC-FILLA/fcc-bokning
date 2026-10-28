"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBooker } from "@/lib/auth";
import { addDays, localToIso } from "@/lib/datum";
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
    internal_notes: opt(fd.get("internal_notes")),
  };
  return EventSchema.safeParse(raw);
}

/** Läser bokningsfälten och returnerar en rad per lokal och vecka. */
function readBookings(fd: FormData, eventId: string) {
  const roomIds = fd.getAll("room_id").map(String).filter(Boolean);
  const date = opt(fd.get("date"));
  const from = opt(fd.get("from"));
  const to = opt(fd.get("to"));
  const repeat = Math.min(52, Math.max(1, Number(fd.get("repeat_weeks") ?? 1) || 1));
  const setup = opt(fd.get("setup_id"));
  const note = opt(fd.get("booking_note"));

  if (!roomIds.length && !date) return { rows: [], error: null };
  if (!roomIds.length) return { rows: [], error: "Välj minst en lokal." };
  if (!date || !from || !to) return { rows: [], error: "Ange datum, starttid och sluttid." };

  const rows = [];
  for (let w = 0; w < repeat; w++) {
    const d = addDays(date, w * 7);
    // Slutar man före eller samma tid som man börjar, slutar bokningen nästa dag (t.ex. 18:00–02:00).
    const endDate = to <= from ? addDays(d, 1) : d;
    for (const room_id of roomIds) {
      rows.push({
        event_id: eventId,
        room_id,
        starts_at: localToIso(`${d}T${from}`),
        ends_at: localToIso(`${endDate}T${to}`),
        setup_id: setup,
        note,
      });
    }
  }
  return { rows, error: null };
}

export async function createEvent(fd: FormData) {
  await requireBooker();
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth";
import { addDays, isoToDate, localToIso } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const back = (eventId: string, q = ""): never => redirect(`/evenemang/${eventId}${q ? `?${q}` : ""}#korschema`);
const opt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

function read(fd: FormData) {
  const date = String(fd.get("date") ?? "");
  const time = String(fd.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  if (!title) return null;
  const dur = Math.round(Number(fd.get("duration_minutes")));
  const room = String(fd.get("room_id") ?? "");
  const fn = String(fd.get("function_id") ?? "");
  return {
    starts_at: localToIso(`${date}T${time}`),
    duration_minutes: Number.isFinite(dur) && dur > 0 ? Math.min(2880, dur) : null,
    title,
    room_id: UUID.test(room) ? room : null,
    function_id: UUID.test(fn) ? fn : null,
    who: opt(fd.get("who"))?.slice(0, 200) ?? null,
    note: opt(fd.get("note"))?.slice(0, 2000) ?? null,
    customer_visible: fd.get("customer_visible") === "on",
    staff_visible: fd.get("staff_visible") === "on",
  };
}

export async function addRunItem(eventId: string, fd: FormData) {
  await requireStaffManager();
  const row = read(fd);
  if (!row) back(eventId, `fel=${encodeURIComponent("Ange dag, tid och vad som händer.")}`);
  const supabase = await createClient();
  const { error } = await supabase.from("run_sheet_items").insert({ ...row!, event_id: eventId });
  revalidatePath(`/evenemang/${eventId}`);
  back(eventId, error ? `fel=${encodeURIComponent("Det gick inte att spara punkten.")}` : "");
}

export async function updateRunItem(eventId: string, itemId: string, fd: FormData) {
  await requireStaffManager();
  const row = read(fd);
  if (!row) back(eventId, `fel=${encodeURIComponent("Ange dag, tid och vad som händer.")}`);
  const supabase = await createClient();
  await supabase.from("run_sheet_items").update(row!).eq("id", itemId).eq("event_id", eventId);
  revalidatePath(`/evenemang/${eventId}`);
  back(eventId);
}

export async function deleteRunItem(eventId: string, itemId: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("run_sheet_items").delete().eq("id", itemId).eq("event_id", eventId);
  revalidatePath(`/evenemang/${eventId}`);
  back(eventId);
}

/** Flyttar alla punkter (eller de från en viss tid) ett antal minuter, t.ex. när middagen blir 20 minuter sen. */
export async function shiftRunItems(eventId: string, fd: FormData) {
  await requireStaffManager();
  const min = Math.round(Number(fd.get("minutes")));
  if (!Number.isFinite(min) || !min || Math.abs(min) > 1440) back(eventId, `fel=${encodeURIComponent("Ange antal minuter.")}`);
  const fromItem = String(fd.get("from_item") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.from("run_sheet_items").select("id, starts_at").eq("event_id", eventId).order("starts_at");
  const list = (data ?? []) as { id: string; starts_at: string }[];
  const start = UUID.test(fromItem) ? list.find((x) => x.id === fromItem)?.starts_at : null;
  for (const x of list.filter((x) => !start || x.starts_at >= start)) {
    await supabase.from("run_sheet_items").update({ starts_at: new Date(new Date(x.starts_at).getTime() + min * 60000).toISOString() }).eq("id", x.id);
  }
  revalidatePath(`/evenemang/${eventId}`);
  back(eventId);
}

/** Kopierar ett annat evenemangs körschema hit, med samma klockslag räknat från första dagen. */
export async function copyRunSheet(eventId: string, fd: FormData) {
  await requireStaffManager();
  const src = String(fd.get("source_event") ?? "");
  const toDate = String(fd.get("to_date") ?? "");
  if (!UUID.test(src) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) back(eventId, `fel=${encodeURIComponent("Välj evenemang och datum.")}`);
  const supabase = await createClient();
  const { data } = await supabase.from("run_sheet_items").select("*").eq("event_id", src).order("starts_at");
  const list = (data ?? []) as Record<string, unknown>[];
  if (!list.length) back(eventId, `fel=${encodeURIComponent("Det evenemanget har inget körschema.")}`);
  const first = isoToDate(String(list[0].starts_at));
  const days = Math.round((Date.parse(`${toDate}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 864e5);
  const rows = list.map((x) => {
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(String(x.starts_at)));
    const day = addDays(isoToDate(String(x.starts_at)), days);
    return {
      event_id: eventId, starts_at: localToIso(`${day}T${local}`), duration_minutes: x.duration_minutes, title: x.title, room_id: x.room_id,
      who: x.who, function_id: x.function_id, note: x.note, customer_visible: x.customer_visible, staff_visible: x.staff_visible,
    };
  });
  await supabase.from("run_sheet_items").insert(rows);
  revalidatePath(`/evenemang/${eventId}`);
  back(eventId);
}

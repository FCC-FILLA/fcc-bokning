"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { parseItems, planFor } from "@/lib/moblering";
import { createClient } from "@/lib/supabase/server";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}fel=${encodeURIComponent(msg)}`);

async function requirePlanner(path: string) {
  if (!canManageStaff(await requireProfile())) fail(path, "Du har inte behörighet att rita möbleringar.");
}

function itemsFrom(fd: FormData) {
  try {
    return parseItems(JSON.parse(String(fd.get("items") ?? "[]")));
  } catch {
    return [];
  }
}

/** Ny ritning: tom, eller en kopia av en mall/annan ritning. Med evenemang blir den evenemangets, annars en mall. */
export async function createLayout(fd: FormData) {
  const eventId = opt(fd.get("event_id"));
  const back = eventId ? `/evenemang/${eventId}#genomforande` : "/mobleringar";
  await requirePlanner(back);
  const supabase = await createClient();
  let roomId = opt(fd.get("room_id"));
  let bookingId = opt(fd.get("booking_id"));
  if (bookingId) {
    const { data: b } = await supabase.from("bookings").select("room_id, setup_id").eq("id", bookingId).single();
    if (b) roomId = b.room_id;
    else bookingId = null;
  }
  const from = opt(fd.get("from"));
  let items: unknown = [];
  let setup = opt(fd.get("setup_id"));
  let notes: string | null = null;
  let name = opt(fd.get("name"));
  if (from) {
    const { data: src } = await supabase.from("layouts").select("items, setup_id, notes, room_id, name").eq("id", from).single();
    if (src) {
      items = src.items;
      setup = setup ?? src.setup_id;
      notes = src.notes;
      roomId = roomId ?? src.room_id;
      name = name ?? src.name;
    }
  }
  if (!roomId) fail(back, "Välj en lokal.");
  if (!setup && bookingId) {
    const { data: b } = await supabase.from("bookings").select("setup_id").eq("id", bookingId).single();
    setup = b?.setup_id ?? null;
  }
  if (!name) {
    const { data: r } = await supabase.from("rooms").select("name").eq("id", roomId!).single();
    name = r?.name ?? "Ritning";
  }
  const { data, error } = await supabase
    .from("layouts")
    .insert({ name, room_id: roomId!, setup_id: setup, event_id: eventId, booking_id: bookingId, items, notes })
    .select("id")
    .single();
  if (error || !data) fail(back, `Kunde inte skapa ritningen: ${error?.message ?? "okänt fel"}`);
  if (eventId) revalidatePath(`/evenemang/${eventId}`);
  redirect(`/mobleringar/${data!.id}`);
}

export async function saveLayout(id: string, fd: FormData) {
  const path = `/mobleringar/${id}`;
  await requirePlanner(path);
  const name = opt(fd.get("name"));
  if (!name) fail(path, "Ritningen behöver ett namn.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("layouts")
    .update({ name, setup_id: opt(fd.get("setup_id")), notes: opt(fd.get("notes")), staff_visible: fd.get("staff_visible") === "on", items: itemsFrom(fd) })
    .eq("id", id)
    .select("event_id")
    .single();
  if (error) fail(path, `Kunde inte spara: ${error.message}`);
  if (data?.event_id) revalidatePath(`/evenemang/${data.event_id}`);
  revalidatePath("/mobleringar");
  redirect(`${path}?sparad=1`);
}

/** Spara en evenemangsritning som mall för lokalen, eller kopiera en mall. */
export async function copyLayout(id: string, asTemplate: boolean) {
  const path = `/mobleringar/${id}`;
  await requirePlanner(path);
  const supabase = await createClient();
  const { data: src } = await supabase.from("layouts").select("*").eq("id", id).single();
  if (!src) fail(path, "Ritningen finns inte.");
  const { data, error } = await supabase
    .from("layouts")
    .insert({
      name: asTemplate ? src!.name : `${src!.name} (kopia)`,
      room_id: src!.room_id,
      setup_id: src!.setup_id,
      items: src!.items,
      notes: src!.notes,
      event_id: asTemplate ? null : src!.event_id,
      booking_id: asTemplate ? null : src!.booking_id,
    })
    .select("id")
    .single();
  if (error || !data) fail(path, `Kunde inte kopiera: ${error?.message ?? "okänt fel"}`);
  revalidatePath("/mobleringar");
  redirect(`/mobleringar/${data!.id}?${asTemplate ? "mall=1" : "kopierad=1"}`);
}

export async function deleteLayout(id: string) {
  const path = `/mobleringar/${id}`;
  await requirePlanner(path);
  const supabase = await createClient();
  const { data } = await supabase.from("layouts").delete().eq("id", id).select("event_id").single();
  revalidatePath("/mobleringar");
  if (data?.event_id) {
    revalidatePath(`/evenemang/${data.event_id}`);
    redirect(`/evenemang/${data.event_id}#genomforande`);
  }
  redirect("/mobleringar");
}

/** Lokalens grundritning: mått och fasta delar. */
export async function saveRoomPlan(roomId: string, fd: FormData) {
  const path = `/lokaler/${roomId}/ritning`;
  if (!isAdmin(await requireProfile())) fail(path, "Bara administratörer kan ändra lokalens grundritning.");
  const width = Number(String(fd.get("width") ?? "").replace(",", "."));
  const depth = Number(String(fd.get("depth") ?? "").replace(",", "."));
  if (!(width >= 2 && width <= 200 && depth >= 2 && depth <= 200)) fail(path, "Bredd och djup måste vara mellan 2 och 200 meter.");
  const supabase = await createClient();
  let area: unknown = null;
  try {
    area = fd.get("area") ? JSON.parse(String(fd.get("area"))) : null;
  } catch {
    area = null;
  }
  const raw = { width, depth, items: itemsFrom(fd), bg: opt(fd.get("bg")) ?? undefined, area: area ?? undefined };
  // planFor validerar bakgrundens sökväg och golvytan.
  const plan = planFor(raw, null);
  const { error } = await supabase.from("rooms").update({ plan }).eq("id", roomId);
  if (error) fail(path, `Kunde inte spara: ${error.message}`);
  revalidatePath("/mobleringar", "layout");
  redirect(`${path}?sparad=1`);
}

/** Lagersaldo och mått för möbeltyperna. */
export async function saveFurniture(fd: FormData) {
  const path = "/installningar/moblering";
  if (!isAdmin(await requireProfile())) fail(path, "Bara administratörer kan ändra möblerna.");
  const supabase = await createClient();
  const ids = fd.getAll("id").map(String);
  for (const id of ids) {
    const num = (k: string) => {
      const v = opt(fd.get(`${k}_${id}`));
      if (v == null) return null;
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const name = opt(fd.get(`name_${id}`));
    const w = num("w");
    const d = num("d");
    const chairs = num("chairs");
    const { error } = await supabase
      .from("furniture_types")
      .update({
        ...(name ? { name } : {}),
        ...(w ? { width_m: w } : {}),
        ...(d ? { depth_m: d } : {}),
        ...(chairs != null ? { default_chairs: Math.round(chairs), max_chairs: Math.max(Math.round(chairs), Math.round(num("max") ?? chairs)) } : {}),
        stock: num("stock") == null ? null : Math.round(num("stock")!),
        active: fd.get(`active_${id}`) === "on",
        supplier: opt(fd.get(`supplier_${id}`)),
      })
      .eq("id", id);
    if (error) fail(path, `Kunde inte spara ${id}: ${error.message}`);
  }
  revalidatePath("/mobleringar", "layout");
  redirect(`${path}?sparad=1`);
}

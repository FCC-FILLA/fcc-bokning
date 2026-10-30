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

function wallsFrom(fd: FormData): string[] | null {
  try {
    const v = JSON.parse(String(fd.get("walls") ?? "null"));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : null;
  } catch {
    return null;
  }
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
  let walls: string[] | null = null;
  let setup = opt(fd.get("setup_id"));
  let notes: string | null = null;
  let name = opt(fd.get("name"));
  if (from) {
    const { data: src } = await supabase.from("layouts").select("items, setup_id, notes, room_id, name, walls").eq("id", from).single();
    if (src) {
      items = src.items;
      walls = src.walls;
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
    .insert({ name, room_id: roomId!, setup_id: setup, event_id: eventId, booking_id: bookingId, items, notes, walls })
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
    .update({ name, setup_id: opt(fd.get("setup_id")), notes: opt(fd.get("notes")), staff_visible: fd.get("staff_visible") === "on", items: itemsFrom(fd), walls: wallsFrom(fd) })
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
      walls: src!.walls,
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
  // Vikväggarnas läge kommer från formuläret, geometrin från den sparade planen.
  const { data: cur } = await supabase.from("rooms").select("plan").eq("id", roomId).single();
  const shut = new Set(wallsFrom(fd) ?? []);
  const oldWalls = planFor(cur?.plan ?? null, null).walls ?? [];
  const f = cur?.plan && Number((cur.plan as { width?: number }).width) > 0 ? width / Number((cur.plan as { width: number }).width) : 1;
  const walls = oldWalls.map((w) => ({ ...w, x1: w.x1 * f, y1: w.y1 * f, x2: w.x2 * f, y2: w.y2 * f, closed: shut.has(w.id) }));
  const raw = { width, depth, items: itemsFrom(fd), bg: opt(fd.get("bg")) ?? undefined, area: area ?? undefined, walls };
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

/** Koppla ritningen till en bokning (och därmed evenemanget). En mall kopieras så att mallen finns kvar. */
export async function linkLayout(id: string, fd: FormData) {
  const path = `/mobleringar/${id}`;
  await requirePlanner(path);
  const bookingId = opt(fd.get("booking_id"));
  if (!bookingId) fail(path, "Välj en bokning.");
  const supabase = await createClient();
  const [{ data: l }, { data: b }] = await Promise.all([
    supabase.from("layouts").select("*").eq("id", id).single(),
    supabase.from("bookings").select("id, event_id, room_id, setup_id").eq("id", bookingId!).single(),
  ]);
  if (!l) fail(path, "Ritningen finns inte.");
  if (!b) fail(path, "Bokningen finns inte.");
  if (b!.room_id !== l!.room_id) fail(path, "Bokningen gäller en annan lokal än ritningen.");
  const keepTemplate = !l!.event_id && fd.get("copy") === "on";
  let target = id;
  if (keepTemplate) {
    const { data, error } = await supabase
      .from("layouts")
      .insert({ name: l!.name, room_id: l!.room_id, setup_id: l!.setup_id ?? b!.setup_id, items: l!.items, walls: l!.walls, notes: l!.notes, event_id: b!.event_id, booking_id: b!.id })
      .select("id")
      .single();
    if (error || !data) fail(path, `Kunde inte koppla: ${error?.message ?? "okänt fel"}`);
    target = data!.id;
  } else {
    const { error } = await supabase.from("layouts").update({ event_id: b!.event_id, booking_id: b!.id, setup_id: l!.setup_id ?? b!.setup_id }).eq("id", id);
    if (error) fail(path, `Kunde inte koppla: ${error.message}`);
  }
  if (l!.event_id) revalidatePath(`/evenemang/${l!.event_id}`);
  revalidatePath(`/evenemang/${b!.event_id}`);
  revalidatePath("/mobleringar");
  redirect(`/mobleringar/${target}?kopplad=1`);
}

/** Ta bort kopplingen till evenemanget. Ritningen blir en mall för lokalen. */
export async function unlinkLayout(id: string) {
  const path = `/mobleringar/${id}`;
  await requirePlanner(path);
  const supabase = await createClient();
  const { data: l } = await supabase.from("layouts").select("event_id").eq("id", id).single();
  const { error } = await supabase.from("layouts").update({ event_id: null, booking_id: null }).eq("id", id);
  if (error) fail(path, `Kunde inte koppla bort: ${error.message}`);
  if (l?.event_id) revalidatePath(`/evenemang/${l.event_id}`);
  revalidatePath("/mobleringar");
  redirect(`${path}?bortkopplad=1`);
}

/** Ny möbel eller nytt objekt i ritverktyget, t.ex. ett inhyrt bord. */
export async function createFurniture(fd: FormData) {
  const path = "/installningar/moblering";
  if (!isAdmin(await requireProfile())) fail(path, "Bara administratörer kan lägga till objekt.");
  const name = opt(fd.get("name"));
  if (!name) fail(`${path}#nytt`, "Objektet behöver ett namn.");
  const shape = String(fd.get("shape") ?? "rect");
  if (!["rect", "round", "chair", "fixed"].includes(shape)) fail(path, "Okänd form.");
  const num = (k: string) => {
    const v = opt(fd.get(k));
    if (v == null) return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  // Mått anges i cm i formuläret.
  const w = (num("w_cm") ?? 0) / 100;
  const d = shape === "round" ? w : (num("d_cm") ?? 0) / 100;
  if (!(w >= 0.1 && w <= 30 && d >= 0.1 && d <= 30)) fail(path, "Ange mått mellan 10 cm och 30 m.");
  const chairs = shape === "rect" || shape === "round" ? Math.round(num("chairs") ?? 0) : 0;
  const max = Math.max(chairs, Math.round(num("max") ?? chairs));
  const color = opt(fd.get("color"));
  const slug = name!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "objekt";
  const supabase = await createClient();
  const { data: last } = await supabase.from("furniture_types").select("sort_order").neq("shape", "fixed").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("furniture_types").insert({
    id: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    shape,
    width_m: w,
    depth_m: d,
    default_chairs: chairs,
    max_chairs: max,
    stock: shape === "fixed" || num("stock") == null ? null : Math.round(num("stock")!),
    supplier: shape === "fixed" ? null : opt(fd.get("supplier")),
    color: color && /^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== "#ffffff" ? color : null,
    sort_order: shape === "fixed" ? 200 : (last?.sort_order ?? 0) + 1,
    active: true,
  });
  if (error) fail(path, `Kunde inte lägga till: ${error.message}`);
  revalidatePath("/mobleringar", "layout");
  redirect(`${path}?skapad=1`);
}

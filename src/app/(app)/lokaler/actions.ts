"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { inLibrary, removeUploaded, uploadImage } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "lokaler";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = opt(v);
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const fail = (path: string, msg: string): never => redirect(`${path}?fel=${encodeURIComponent(msg)}`);

async function requireAdmin(path: string) {
  if (!isAdmin(await requireProfile())) fail(path, "Bara administratörer kan ändra lokaler.");
}

function refresh(id?: string) {
  revalidatePath("/lokaler");
  if (id) revalidatePath(`/lokaler/${id}`);
  revalidatePath("/", "layout");
}

/** Uppgifter, säljtext och kapacitet per möblering. */
export async function updateRoom(id: string, fd: FormData) {
  const path = `/lokaler/${id}`;
  await requireAdmin(path);
  const name = opt(fd.get("name"));
  if (!name) fail(path, "Lokalen behöver ett namn.");
  const supabase = await createClient();

  // Överordnad lokal får inte vara lokalen själv eller någon av dess dellokaler (det skulle ge en loop).
  const parent_id = opt(fd.get("parent_id"));
  if (parent_id) {
    const { data: all } = await supabase.from("rooms").select("id, parent_id");
    const parentOf = new Map(((all ?? []) as { id: string; parent_id: string | null }[]).map((r) => [r.id, r.parent_id]));
    for (let p: string | null | undefined = parent_id; p; p = parentOf.get(p)) {
      if (p === id) fail(path, "En lokal kan inte ligga inuti sig själv eller sina egna delytor.");
    }
  }

  const { error } = await supabase
    .from("rooms")
    .update({
      name,
      name_en: opt(fd.get("name_en")),
      short_name: opt(fd.get("short_name")),
      parent_id,
      kvm: num(fd.get("kvm")),
      kvm_note: opt(fd.get("kvm_note")),
      note: opt(fd.get("note")),
      sales_text: opt(fd.get("sales_text")),
      sales_text_en: opt(fd.get("sales_text_en")),
      bookable: fd.get("bookable") === "on",
      active: fd.get("active") === "on",
      sort_order: Math.round(num(fd.get("sort_order")) ?? 0),
    })
    .eq("id", id);
  if (error) fail(path, "Det gick inte att spara lokalen.");

  // Kapacitet: tomt eller 0 betyder att möbleringen inte går i lokalen.
  const { data: setups } = await supabase.from("setups").select("id");
  const upsert: { room_id: string; setup_id: string; capacity: number }[] = [];
  const remove: string[] = [];
  for (const s of (setups ?? []) as { id: string }[]) {
    const v = num(fd.get(`cap_${s.id}`));
    if (v && v > 0) upsert.push({ room_id: id, setup_id: s.id, capacity: Math.round(v) });
    else remove.push(s.id);
  }
  if (upsert.length) await supabase.from("room_capacities").upsert(upsert);
  if (remove.length) await supabase.from("room_capacities").delete().eq("room_id", id).in("setup_id", remove);

  refresh(id);
  redirect(`${path}?sparad=1`);
}

export async function createRoom(fd: FormData) {
  await requireAdmin("/lokaler");
  const name = opt(fd.get("name"));
  if (!name) fail("/lokaler", "Ge lokalen ett namn.");
  const supabase = await createClient();
  const parent_id = opt(fd.get("parent_id"));
  const { data: ref } = parent_id
    ? await supabase.from("rooms").select("site_id").eq("id", parent_id).single()
    : await supabase.from("rooms").select("site_id").order("sort_order").limit(1).single();
  const { data, error } = await supabase
    .from("rooms")
    .insert({ name, parent_id, site_id: ref?.site_id, sort_order: 900 })
    .select("id")
    .single();
  if (error || !data) fail("/lokaler", "Det gick inte att skapa lokalen.");
  refresh();
  redirect(`/lokaler/${data!.id}?ny=1`);
}

async function loadImages(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("rooms").select("image_path, gallery").eq("id", id).single();
  const list = [data?.image_path, ...((data?.gallery as string[] | null) ?? [])].filter((p): p is string => !!p);
  return { supabase, list };
}

async function saveImages(id: string, list: string[]) {
  const supabase = await createClient();
  const unique = [...new Set(list)];
  await supabase.from("rooms").update({ image_path: unique[0] ?? null, gallery: unique.slice(1) }).eq("id", id);
  refresh(id);
}

/** Lägger till en bild: uppladdad eller en av FCC:s egna. Första bilden blir huvudbild. */
export async function addRoomImage(id: string, fd: FormData) {
  const path = `/lokaler/${id}`;
  await requireAdmin(path);
  const { supabase, list } = await loadImages(id);
  const file = fd.get("image");
  let url: string | null = null;
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, BUCKET, id, file);
    if (up.error) fail(path, up.error);
    url = up.url!;
  } else {
    const choice = String(fd.get("photo") ?? "");
    if (await inLibrary(supabase, choice)) url = choice;
  }
  if (!url) fail(path, "Välj en bild att lägga till.");
  if (list.includes(url!)) fail(path, "Bilden finns redan på lokalen.");
  await saveImages(id, [...list, url!]);
  redirect(`${path}?bild=1#bilder`);
}

/** Flytta, gör till huvudbild eller ta bort en bild. */
export async function changeRoomImage(id: string, image: string, action: "main" | "left" | "right" | "remove") {
  const path = `/lokaler/${id}`;
  await requireAdmin(path);
  const { supabase, list } = await loadImages(id);
  const i = list.indexOf(image);
  if (i < 0) redirect(`${path}#bilder`);
  const next = [...list];
  if (action === "remove") next.splice(i, 1);
  if (action === "main") next.unshift(...next.splice(i, 1));
  if (action === "left" && i > 0) [next[i - 1], next[i]] = [next[i], next[i - 1]];
  if (action === "right" && i < next.length - 1) [next[i + 1], next[i]] = [next[i], next[i + 1]];
  await saveImages(id, next);
  if (action === "remove") await removeUploaded(supabase, BUCKET, image);
  redirect(`${path}#bilder`);
}

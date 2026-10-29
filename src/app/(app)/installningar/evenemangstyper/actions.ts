"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { inLibrary, uploadImage } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";

const PATH = "/installningar/evenemangstyper";
const fail = (msg: string): never => redirect(`${PATH}?fel=${encodeURIComponent(msg)}`);

async function admin() {
  if (!isAdmin(await requireProfile())) fail("Bara administratörer kan ändra evenemangstyperna.");
  return createClient();
}

async function pick(supabase: Awaited<ReturnType<typeof createClient>>, fd: FormData, field: string, current: string | null, label: string) {
  const file = fd.get(`${field}_file`);
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, "lokaler", "typer", file, label);
    if (up.error) fail(up.error);
    return up.url!;
  }
  const choice = String(fd.get(field) ?? "keep");
  if (choice === "keep") return current;
  if (choice === "") return null;
  return (await inLibrary(supabase, choice)) ? choice : current;
}

export async function saveEventType(id: string, fd: FormData) {
  const supabase = await admin();
  const { data: cur } = await supabase.from("event_types").select("cover_image, about_image").eq("id", id).single();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) fail("Ange ett namn.");
  const cover_image = await pick(supabase, fd, "cover_image", cur?.cover_image ?? null, `${name}, omslag`);
  const about_image = await pick(supabase, fd, "about_image", cur?.about_image ?? null, `${name}, textblock`);
  const { error } = await supabase.from("event_types").update({ name, cover_image, about_image, sort_order: Number(fd.get("sort_order")) || 0, color: /^#[0-9a-f]{6}$/i.test(String(fd.get("color"))) ? String(fd.get("color")) : null }).eq("id", id);
  if (error) fail("Det gick inte att spara.");
  revalidatePath("/", "layout");
  redirect(`${PATH}?sparad=1#typ-${id}`);
}

export async function addEventType(fd: FormData) {
  const supabase = await admin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) fail("Ange ett namn.");
  const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `typ-${Date.now()}`;
  const { error } = await supabase.from("event_types").insert({ id, name, sort_order: 50 });
  if (error) fail(error.code === "23505" ? "Det finns redan en typ med det namnet." : "Det gick inte att lägga till typen.");
  revalidatePath("/", "layout");
  redirect(`${PATH}?sparad=1#typ-${id}`);
}

export async function deleteEventType(id: string) {
  const supabase = await admin();
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("event_type_id", id);
  if (count) fail(`Typen används av ${count} evenemang och kan inte tas bort.`);
  const { error } = await supabase.from("event_types").delete().eq("id", id);
  if (error) fail("Typen används och kan inte tas bort.");
  revalidatePath("/", "layout");
  redirect(`${PATH}?borttagen=1`);
}

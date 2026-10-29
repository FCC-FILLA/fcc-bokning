"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { storagePath, uploadImage } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";
import { findUsage } from "./usage";

const PATH = "/installningar/bilder";
const back = (q: string): never => redirect(`${PATH}?${q}`);
const fail = (msg: string): never => back(`fel=${encodeURIComponent(msg)}`);

async function admin() {
  if (!isAdmin(await requireProfile())) fail("Bara administratörer kan ändra bildbanken.");
  return createClient();
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Laddar upp en eller flera nya bilder till banken. */
export async function addImages(fd: FormData) {
  const supabase = await admin();
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) fail("Välj minst en bild.");
  for (const f of files) {
    const up = await uploadImage(supabase, "lokaler", "bildbank", f);
    if (up.error) fail(up.error);
  }
  refresh();
  back(`tillagd=${files.length}`);
}

export async function renameImage(id: string, fd: FormData) {
  const supabase = await admin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!name) fail("Ange ett namn.");
  await supabase.from("media_images").update({ name }).eq("id", id);
  refresh();
  back(`sparad=1#bild-${id}`);
}

/** Byter bilden mot en ny fil, överallt där den används. */
export async function replaceImage(id: string, fd: FormData) {
  const supabase = await admin();
  const { data: cur } = await supabase.from("media_images").select("url, name").eq("id", id).single();
  if (!cur) fail("Bilden finns inte.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Välj en ny bild.");
  // Den nya filen läggs först utanför banken (uploadImage registrerar den); ta bort den raden och flytta adressen.
  const up = await uploadImage(supabase, "lokaler", "bildbank", file as File, cur!.name);
  if (up.error) fail(up.error);
  await supabase.from("media_images").delete().eq("url", up.url!);
  const { error } = await supabase.rpc("replace_image", { p_old: cur!.url, p_new: up.url! });
  if (error) fail("Det gick inte att byta bilden.");
  const old = storagePath(cur!.url, "lokaler");
  if (old) await supabase.storage.from("lokaler").remove([old]);
  refresh();
  back(`bytt=1#bild-${id}`);
}

/** Tar bort en bild ur banken. Går bara om den inte används någonstans. */
export async function deleteImage(id: string) {
  const supabase = await admin();
  const { data: cur } = await supabase.from("media_images").select("url").eq("id", id).single();
  if (!cur) back("");
  const usage = (await findUsage(supabase)).get(cur!.url) ?? [];
  if (usage.length) fail(`Bilden används fortfarande: ${usage.join(", ")}.`);
  await supabase.from("media_images").delete().eq("id", id);
  const p = storagePath(cur!.url, "lokaler") ?? storagePath(cur!.url, "artiklar");
  if (p) await supabase.storage.from(cur!.url.includes("/public/artiklar/") ? "artiklar" : "lokaler").remove([p]);
  refresh();
  back("borttagen=1");
}

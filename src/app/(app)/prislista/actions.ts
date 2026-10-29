"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { inLibrary, removeUploaded, uploadImage } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = opt(v);
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function requireAdmin() {
  const p = await requireProfile();
  if (!isAdmin(p)) throw new Error("Bara administratörer kan ändra prislistan.");
}

function readArticle(fd: FormData) {
  return {
    article_no: opt(fd.get("article_no")),
    name: opt(fd.get("name")) ?? "",
    group_id: opt(fd.get("group_id")) ?? "ovrigt",
    unit: opt(fd.get("unit")) ?? "st",
    price: num(fd.get("price")),
    cost: num(fd.get("cost")) ?? 0,
    vat_rate: num(fd.get("vat_rate")) ?? 25,
    room_id: opt(fd.get("room_id")),
    active: fd.get("active") === "on",
  };
}

function back(q: string, keep: string) {
  redirect(`/prislista?${q}${keep ? `&${keep}` : ""}`);
}

export async function updateArticle(id: string, keep: string, fd: FormData) {
  await requireAdmin();
  const a = readArticle(fd);
  if (!a.name) back(`fel=${encodeURIComponent("Artikeln behöver ett namn.")}`, keep);
  const supabase = await createClient();
  const { error } = await supabase.from("articles").update(a).eq("id", id);
  revalidatePath("/prislista");
  back(
    error
      ? `fel=${encodeURIComponent(error.code === "23505" ? "Artikelnumret används redan." : "Det gick inte att spara.")}`
      : `sparad=${encodeURIComponent(a.name)}`,
    keep,
  );
}

export async function createArticle(fd: FormData) {
  await requireAdmin();
  const a = readArticle(fd);
  if (!a.name) back(`fel=${encodeURIComponent("Artikeln behöver ett namn.")}`, "");
  const supabase = await createClient();
  const { error } = await supabase.from("articles").insert({ ...a, active: true, sort_order: 999 });
  revalidatePath("/prislista");
  back(
    error
      ? `fel=${encodeURIComponent(error.code === "23505" ? "Artikelnumret används redan." : "Det gick inte att spara.")}`
      : `sparad=${encodeURIComponent(a.name)}`,
    `grupp=${a.group_id}`,
  );
}

export async function saveSetting(key: string, fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({ key, value: String(fd.get("value") ?? ""), updated_at: new Date().toISOString() });
  revalidatePath("/installningar/offert");
  redirect("/installningar/offert?sparad=1");
}

const BUCKET = "artiklar";

/** Ikon, bild och kundtext för en artikel. */
export async function saveArticleMedia(id: string, fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: cur } = await supabase.from("articles").select("image_path").eq("id", id).single();
  const back = (q: string) => redirect(`/prislista/${id}?${q}`);
  let image_path: string | null = cur?.image_path ?? null;

  const file = fd.get("image");
  const choice = String(fd.get("image_choice") ?? "keep");
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, BUCKET, id, file);
    if (up.error) back(`fel=${encodeURIComponent(up.error)}`);
    image_path = up.url!;
  } else if (choice !== "keep") {
    image_path = choice === "" ? null : (await inLibrary(supabase, choice)) ? choice : image_path;
  }

  const { error } = await supabase
    .from("articles")
    .update({
      icon: opt(fd.get("icon")),
      description: opt(fd.get("description")),
      name_en: opt(fd.get("name_en")),
      description_en: opt(fd.get("description_en")),
      image_path,
    })
    .eq("id", id);
  if (error) back(`fel=${encodeURIComponent("Det gick inte att spara.")}`);
  if (cur?.image_path !== image_path) await removeUploaded(supabase, BUCKET, cur?.image_path);

  revalidatePath("/prislista");
  revalidatePath(`/prislista/${id}`);
  back("sparad=1");
}

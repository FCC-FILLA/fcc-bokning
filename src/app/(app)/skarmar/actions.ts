"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Skärmarnas inställningar: nycklar till länkarna och logeskärmens innehåll.

/** Ny nyckel till kontorsskärmen. Den gamla länken slutar fungera direkt. */
export async function rotateScreenToken() {
  if (!isAdmin(await requireProfile())) redirect("/skarmar/kontor?fel=" + encodeURIComponent("Bara administratörer kan byta nyckel."));
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "screen_token", value: crypto.randomUUID(), updated_at: new Date().toISOString() });
  if (error) redirect("/skarmar/kontor?fel=" + encodeURIComponent("Det gick inte att byta nyckel."));
  revalidatePath("/skarmar/kontor");
  redirect("/skarmar/kontor?ny=1");
}

const LOGE_FIELDS = ["loge_camera_url", "loge_wifi_name", "loge_wifi_password", "loge_info_sv", "loge_info_en"] as const;

/** Logeskärmens innehåll: kameralänk, Wi-Fi och praktisk info på svenska och engelska. */
export async function saveLogeSettings(fd: FormData) {
  if (!isAdmin(await requireProfile())) redirect("/skarmar/loge?fel=" + encodeURIComponent("Bara administratörer kan ändra logeskärmen."));
  const camera = String(fd.get("loge_camera_url") ?? "").trim();
  if (/^rtsps?:\/\//i.test(camera)) {
    redirect("/skarmar/loge?fel=" + encodeURIComponent("RTSP-länkar kan inte visas i en webbläsare. Klistra in länken från omvandlaren (t.ex. go2rtc) i stället, se beskrivningen under fältet."));
  }
  if (camera && !/^https?:\/\/\S+$/i.test(camera)) {
    redirect("/skarmar/loge?fel=" + encodeURIComponent("Kameralänken måste börja med https:// (eller http://)."));
  }
  const now = new Date().toISOString();
  const rows = LOGE_FIELDS.map((key) => ({
    key,
    value: String(fd.get(key) ?? "").trim().slice(0, key.startsWith("loge_info") ? 4000 : 1000),
    updated_at: now,
  }));
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(rows);
  if (error) redirect("/skarmar/loge?fel=" + encodeURIComponent("Det gick inte att spara."));
  revalidatePath("/skarmar/loge");
  redirect("/skarmar/loge?sparad=1");
}

/** Ny nyckel till logeskärmen. Den gamla länken slutar fungera direkt. */
export async function rotateLogeToken() {
  if (!isAdmin(await requireProfile())) redirect("/skarmar/loge?fel=" + encodeURIComponent("Bara administratörer kan byta nyckel."));
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "loge_token", value: crypto.randomUUID(), updated_at: new Date().toISOString() });
  if (error) redirect("/skarmar/loge?fel=" + encodeURIComponent("Det gick inte att byta nyckel."));
  revalidatePath("/skarmar/loge");
  redirect("/skarmar/loge?ny=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { isFccPhoto, storagePath, uploadImage } from "@/lib/bilder";
import { COMPANY_FIELDS } from "@/lib/foretag";
import { createClient } from "@/lib/supabase/server";

export async function saveCompany(fd: FormData) {
  if (!isAdmin(await requireProfile())) redirect("/installningar/foretag?fel=" + encodeURIComponent("Bara administratörer kan ändra företagsuppgifterna."));
  const now = new Date().toISOString();
  const rows = COMPANY_FIELDS.map((f) => ({
    key: `company_${f.key}`,
    value: String(fd.get(f.key) ?? "").trim().slice(0, 200),
    updated_at: now,
  }));
  if (!rows.find((r) => r.key === "company_name")?.value) {
    redirect("/installningar/foretag?fel=" + encodeURIComponent("Ange ett namn."));
  }
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert(rows);
  if (error) redirect("/installningar/foretag?fel=" + encodeURIComponent("Det gick inte att spara."));
  revalidatePath("/", "layout");
  redirect("/installningar/foretag?sparad=1");
}

const TEXT_KEYS = ["quote_intro", "quote_intro_en", "quote_terms", "quote_terms_en", "look_closing", "look_closing_en"];
const FLAG_KEYS = ["look_show_rooms", "look_show_program", "look_show_addons", "look_show_images"];

/** Offertens standardtexter (svenska och engelska) och utseende. */
export async function saveQuoteSettings(fd: FormData) {
  const path = "/installningar/offert";
  if (!isAdmin(await requireProfile())) redirect(`${path}?fel=` + encodeURIComponent("Bara administratörer kan ändra offerten."));
  const supabase = await createClient();
  const now = new Date().toISOString();

  let cover = String(fd.get("look_cover") ?? "");
  const file = fd.get("cover_file");
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, "lokaler", "omslag", file);
    if (up.error) redirect(`${path}?fel=${encodeURIComponent(up.error)}`);
    cover = up.url!;
  } else if (cover && !isFccPhoto(cover) && !storagePath(cover, "lokaler")) {
    cover = "";
  }

  const days = Math.round(Number(fd.get("quote_valid_days")));
  const rows = [
    ...TEXT_KEYS.map((key) => ({ key, value: String(fd.get(key) ?? "").trim().slice(0, 8000), updated_at: now })),
    ...FLAG_KEYS.map((key) => ({ key, value: fd.get(key) === "on" ? "1" : "0", updated_at: now })),
    { key: "look_cover", value: cover, updated_at: now },
    { key: "quote_valid_days", value: String(Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30), updated_at: now },
  ];
  const { error } = await supabase.from("app_settings").upsert(rows);
  if (error) redirect(`${path}?fel=${encodeURIComponent("Det gick inte att spara.")}`);
  revalidatePath("/", "layout");
  redirect(`${path}?sparad=1`);
}

/** Markera ett mejl i kön som skickat för hand, eller stryk det. */
export async function setMailStatus(id: string, status: "skickad" | "struken") {
  await requireProfile();
  const supabase = await createClient();
  await supabase.from("email_outbox").update({ status, sent_at: status === "skickad" ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/installningar/epost");
  redirect("/installningar/epost");
}

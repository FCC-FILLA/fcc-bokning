"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { inLibrary, uploadImage } from "@/lib/bilder";
import { kickMail } from "@/lib/epost";
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

const TEXT_KEYS = [
  "quote_intro", "quote_intro_en", "quote_terms", "quote_terms_en", "look_closing", "look_closing_en",
  "look_about_title", "look_about_title_en", "look_about", "look_about_en",
];
const FLAG_KEYS = ["look_show_rooms", "look_show_program", "look_show_addons", "look_show_images", "look_show_unit_prices", "look_show_group_totals"];
const SECTION_IDS = ["intro", "rooms", "program", "price", "addons", "closing", "about", "terms"];

/** Bild från formuläret: uppladdad fil, ett av FCC:s foton, behåll eller ta bort. */
async function pickImage(supabase: Awaited<ReturnType<typeof createClient>>, fd: FormData, field: string, current: string, prefix: string) {
  const file = fd.get(`${field}_file`);
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, "lokaler", prefix, file);
    if (up.error) return { error: up.error };
    return { url: up.url! };
  }
  const choice = String(fd.get(field) ?? "keep");
  if (choice === "keep") return { url: current };
  if (choice === "" || choice === current || (await inLibrary(supabase, choice))) return { url: choice };
  return { url: current };
}

/** Offertens standardtexter (svenska och engelska) och utseende. */
export async function saveQuoteSettings(fd: FormData) {
  const path = "/installningar/offert";
  if (!isAdmin(await requireProfile())) redirect(`${path}?fel=` + encodeURIComponent("Bara administratörer kan ändra offerten."));
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: curRows } = await supabase.from("app_settings").select("key, value").in("key", ["look_logo", "look_about_image"]);
  const cur = new Map(((curRows ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));
  const logo = await pickImage(supabase, fd, "look_logo", cur.get("look_logo") ?? "", "logga");
  const aboutImage = await pickImage(supabase, fd, "look_about_image", cur.get("look_about_image") ?? "", "textblock");
  if (logo.error || aboutImage.error) redirect(`${path}?fel=${encodeURIComponent((logo.error ?? aboutImage.error)!)}`);
  const accent = /^#[0-9a-f]{6}$/i.test(String(fd.get("look_accent"))) ? String(fd.get("look_accent")) : "#60272b";
  const hero = ["stor", "kompakt", "ingen"].includes(String(fd.get("look_hero"))) ? String(fd.get("look_hero")) : "stor";
  const font = fd.get("look_font") === "klassisk" ? "klassisk" : "modern";
  const order = [...SECTION_IDS].sort((a, b) => (Number(fd.get(`order_${a}`)) || 99) - (Number(fd.get(`order_${b}`)) || 99)).join(",");

  let cover = String(fd.get("look_cover") ?? "");
  const file = fd.get("cover_file");
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage(supabase, "lokaler", "omslag", file);
    if (up.error) redirect(`${path}?fel=${encodeURIComponent(up.error)}`);
    cover = up.url!;
  } else if (cover && !(await inLibrary(supabase, cover))) {
    cover = "";
  }

  const days = Math.round(Number(fd.get("quote_valid_days")));
  const rows = [
    ...TEXT_KEYS.map((key) => ({ key, value: String(fd.get(key) ?? "").trim().slice(0, 8000), updated_at: now })),
    ...FLAG_KEYS.map((key) => ({ key, value: fd.get(key) === "on" ? "1" : "0", updated_at: now })),
    { key: "look_cover", value: cover, updated_at: now },
    { key: "look_logo", value: logo.url ?? "", updated_at: now },
    { key: "look_about_image", value: aboutImage.url ?? "", updated_at: now },
    { key: "look_accent", value: accent, updated_at: now },
    { key: "look_hero", value: hero, updated_at: now },
    { key: "look_font", value: font, updated_at: now },
    { key: "look_order", value: order, updated_at: now },
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

/** Avsändare och svarsadress för all e-post från appen. */
export async function saveMailSettings(fd: FormData) {
  if (!isAdmin(await requireProfile())) redirect("/installningar/epost?fel=" + encodeURIComponent("Bara administratörer kan ändra."));
  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("app_settings").upsert([
    { key: "mail_from", value: String(fd.get("mail_from") ?? "").trim().slice(0, 200), updated_at: now },
    { key: "mail_reply_to", value: String(fd.get("mail_reply_to") ?? "").trim().slice(0, 200), updated_at: now },
    { key: "invoice_email_to", value: String(fd.get("invoice_email_to") ?? "").trim().slice(0, 200), updated_at: now },
    { key: "payroll_email", value: String(fd.get("payroll_email") ?? "").trim().slice(0, 200), updated_at: now },
    { key: "mail_test_to", value: fd.get("test_mode") === "on" ? String(fd.get("mail_test_to") ?? "").trim().slice(0, 200) : "", updated_at: now },
  ]);
  revalidatePath("/installningar/epost");
  redirect("/installningar/epost?sparad=1");
}

/** Lägger ett testmejl till mig själv i kön och puffar avsändaren. */
export async function sendTestMail() {
  const me = await requireProfile();
  if (!me.email) redirect("/installningar/epost?fel=" + encodeURIComponent("Ditt konto saknar e-postadress."));
  const supabase = await createClient();
  await supabase.from("email_outbox").insert({
    to_email: me.email,
    to_name: me.full_name || null,
    subject: "Testmejl från FCC Bokning",
    body: "Hej!\n\nOm du läser det här fungerar e-posten från FCC Bokning.",
    kind: "test",
  });
  await kickMail();
  revalidatePath("/installningar/epost");
  redirect("/installningar/epost?test=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Öppnar en notis: markerar den som läst och går till det den gäller. */
export async function openNotification(id: string, link: string | null) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/", "layout");
  redirect(link && link.startsWith("/") ? link : "/notiser");
}

export async function markAllRead() {
  const p = await requireProfile();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", p.id).is("read_at", null);
  revalidatePath("/", "layout");
  redirect("/notiser");
}

export async function saveNotifyPrefs(fd: FormData) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("set_my_notify_prefs", {
    p_kinds: fd.getAll("kinds").map(String),
    p_scope: String(fd.get("scope") ?? "mina"),
    p_email: fd.get("email") === "on",
  });
  revalidatePath("/notiser");
  redirect("/notiser?sparad=1#installningar");
}

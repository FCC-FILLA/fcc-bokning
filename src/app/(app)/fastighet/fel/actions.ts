"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateIssue(id: string, fd: FormData) {
  await requireStaffManager();
  const status = String(fd.get("status") ?? "ny");
  const assignee = String(fd.get("assignee_id") ?? "");
  const supabase = await createClient();
  await supabase.from("room_issues").update({
    status: ["ny", "pagaende", "klar"].includes(status) ? status : "ny",
    assignee_id: /^[0-9a-f-]{36}$/i.test(assignee) ? assignee : null,
    resolution: String(fd.get("resolution") ?? "").trim().slice(0, 2000) || null,
    resolved_at: status === "klar" ? new Date().toISOString() : null,
  }).eq("id", id);
  revalidatePath("/fastighet/fel");
  redirect(`/fastighet/fel${fd.get("back") ? `?${fd.get("back")}` : ""}#${id}`);
}

/** Planerare lägger in ett fel själva. */
export async function createIssue(fd: FormData) {
  await requireStaffManager();
  const room = String(fd.get("room_id") ?? "");
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  if (!/^[0-9a-f-]{36}$/i.test(room) || !title) redirect(`/fastighet/fel?fel=${encodeURIComponent("Välj lokal och skriv vad som är fel.")}`);
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  await supabase.from("room_issues").insert({ room_id: room, title, description: String(fd.get("description") ?? "").trim() || null, reporter_name: me.user?.email ?? null });
  revalidatePath("/fastighet/fel");
  redirect("/fastighet/fel");
}

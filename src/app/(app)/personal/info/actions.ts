"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PATH = "/personal/info";
async function manager() {
  if (!canManageStaff(await requireProfile())) redirect(`${PATH}?fel=${encodeURIComponent("Du kan inte ändra personalinfon.")}`);
  return createClient();
}
const read = (fd: FormData) => ({
  title: String(fd.get("title") ?? "").trim().slice(0, 100),
  body: String(fd.get("body") ?? "").trim().slice(0, 4000),
  icon: String(fd.get("icon") ?? "") || null,
  audience: fd.getAll("audience").map(String).filter((x) => ["intern", "frilans", "leverantor"].includes(x)),
  only_when_booked: fd.get("only_when_booked") === "on",
  sort_order: Math.round(Number(fd.get("sort_order"))) || 0,
  updated_at: new Date().toISOString(),
});

export async function saveInfo(id: string, fd: FormData) {
  const supabase = await manager();
  const row = read(fd);
  if (!row.title) redirect(`${PATH}?fel=${encodeURIComponent("Ange en rubrik.")}`);
  await supabase.from("staff_info").update(row).eq("id", id);
  revalidatePath(PATH);
  redirect(`${PATH}?sparad=1#info-${id}`);
}

export async function addInfo(fd: FormData) {
  const supabase = await manager();
  const row = read(fd);
  if (!row.title) redirect(`${PATH}?fel=${encodeURIComponent("Ange en rubrik.")}`);
  const { data } = await supabase.from("staff_info").insert({ ...row, sort_order: row.sort_order || 50 }).select("id").single();
  revalidatePath(PATH);
  redirect(`${PATH}?sparad=1#info-${data?.id ?? ""}`);
}

export async function deleteInfo(id: string) {
  const supabase = await manager();
  await supabase.from("staff_info").delete().eq("id", id);
  revalidatePath(PATH);
  redirect(PATH);
}

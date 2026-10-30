"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PATH = "/personal/rutiner";
const t = (fd: FormData, k: string, n = 300) => String(fd.get(k) ?? "").trim().slice(0, n);

export async function saveRoutine(id: string | null, fd: FormData) {
  await requireStaffManager();
  const name = t(fd, "name", 100);
  if (!name) redirect(`${PATH}?fel=${encodeURIComponent("Ge rutinen ett namn.")}`);
  const supabase = await createClient();
  const row = { name, description: t(fd, "description", 500) || null, active: id ? fd.get("active") === "on" : true, sort_order: Number(fd.get("sort_order") ?? 0) || 0 };
  if (id) await supabase.from("routines").update(row).eq("id", id);
  else await supabase.from("routines").insert(row);
  revalidatePath(PATH);
  redirect(PATH);
}

export async function saveStep(routineId: string, stepId: string | null, fd: FormData) {
  await requireStaffManager();
  const title = t(fd, "title", 200);
  const supabase = await createClient();
  if (!title && stepId) {
    await supabase.from("routine_steps").update({ active: false }).eq("id", stepId);
  } else if (title) {
    const row = { title, help: t(fd, "help", 500) || null, sort_order: Number(fd.get("sort_order") ?? 0) || 0 };
    if (stepId) await supabase.from("routine_steps").update(row).eq("id", stepId);
    else await supabase.from("routine_steps").insert({ ...row, routine_id: routineId });
  }
  revalidatePath(PATH);
  redirect(`${PATH}#r-${routineId}`);
}

/** Tar bort en punkt ur rutinen. Gamla genomgångar behåller sina bockar. */
export async function removeStep(routineId: string, stepId: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("routine_steps").update({ active: false }).eq("id", stepId);
  revalidatePath(PATH);
  redirect(`${PATH}#r-${routineId}`);
}

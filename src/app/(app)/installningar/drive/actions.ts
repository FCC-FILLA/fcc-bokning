"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { parseFolderId } from "@/lib/drive";
import { createClient } from "@/lib/supabase/server";

export async function saveDriveRoot(fd: FormData) {
  if (!isAdmin(await requireProfile())) redirect("/installningar/drive?fel=" + encodeURIComponent("Bara administratörer kan ändra."));
  const raw = String(fd.get("root") ?? "");
  const id = raw.trim() ? parseFolderId(raw) : "";
  if (id === null) redirect("/installningar/drive?fel=" + encodeURIComponent("Det ser inte ut som en länk till en mapp i Google Drive."));
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({ key: "drive_root_folder", value: id, updated_at: new Date().toISOString() });
  revalidatePath("/installningar/drive");
  redirect("/installningar/drive?sparad=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { minutes } from "@/lib/bokning";
import { createClient } from "@/lib/supabase/server";

const PATH = "/installningar/omstallning";

/** Sparar standardtid per möblering, egna par och standard när möbleringen är okänd. */
export async function saveChangeovers(fd: FormData) {
  if (!isAdmin(await requireProfile())) redirect(`${PATH}?fel=${encodeURIComponent("Bara administratörer kan ändra.")}`);
  const supabase = await createClient();
  const { data: setups } = await supabase.from("setups").select("id");
  const ids = ((setups ?? []) as { id: string }[]).map((x) => x.id);
  for (const id of ids) {
    await supabase.from("setups").update({ changeover_minutes: minutes(fd.get(`std_${id}`)) }).eq("id", id);
  }
  // Par: tomt fält betyder standard (raden tas bort).
  const pairs: { from_setup: string; to_setup: string; minutes: number }[] = [];
  for (const a of ids)
    for (const b of ids) {
      const v = String(fd.get(`p_${a}_${b}`) ?? "").trim();
      if (v !== "") pairs.push({ from_setup: a, to_setup: b, minutes: minutes(v) });
    }
  await supabase.from("setup_changeovers").delete().neq("from_setup", "");
  if (pairs.length) await supabase.from("setup_changeovers").insert(pairs);
  await supabase.from("app_settings").upsert({ key: "changeover_default_minutes", value: String(minutes(fd.get("default_minutes"))), updated_at: new Date().toISOString() });
  revalidatePath("/", "layout");
  redirect(`${PATH}?sparad=1`);
}

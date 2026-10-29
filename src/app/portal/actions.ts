"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MSG: Record<string, string> = {
  stangt: "Passet går inte längre att söka.",
  fel_funktion: "Du är inte registrerad för den funktionen.",
  nekad: "Du har redan fått nej på det här passet.",
  ej_personal: "Ditt konto är inte kopplat till personalregistret.",
  ej_ansokt: "Det fanns ingen ansökan att dra tillbaka.",
};

export async function apply(shiftId: string, tab: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_apply", { p_shift: shiftId });
  revalidatePath("/portal");
  redirect(`/portal?flik=${tab}&${data === "ok" ? "sokt=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}`);
}

export async function withdraw(shiftId: string, tab: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_withdraw", { p_shift: shiftId });
  revalidatePath("/portal");
  redirect(`/portal?flik=${tab}&${data === "ok" ? "aterkallad=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/logga-in");
}

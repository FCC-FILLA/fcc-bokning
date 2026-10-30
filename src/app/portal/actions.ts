"use server";

import { deliverNotifications } from "@/lib/notiser";
import { detailsFromForm } from "@/components/staff-details-form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { localToIso } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { readUnavailability } from "@/lib/ledighet";

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
  deliverNotifications();
  revalidatePath("/portal");
  redirect(`/portal?flik=${tab}&${data === "ok" ? "sokt=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}`);
}

export async function withdraw(shiftId: string, tab: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_withdraw", { p_shift: shiftId });
  deliverNotifications();
  revalidatePath("/portal");
  redirect(`/portal?flik=${tab}&${data === "ok" ? "aterkallad=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/logga-in");
}

const TIME_MSG: Record<string, string> = {
  ej_tilldelad: "Du har inte det här passet.",
  for_tidigt: "Tid kan rapporteras när passet har börjat.",
  attesterad: "Tiden är redan attesterad.",
  last: "Månaden är låst. Kontakta den som planerar personal.",
  ogiltig_tid: "Kontrollera tiderna.",
  ogiltig_rast: "Rasten kan inte vara längre än passet.",
};

export async function reportTime(shiftId: string, tab: string, fd: FormData) {
  const date = String(fd.get("date") ?? "");
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    redirect(`/portal?flik=${tab}&fel=${encodeURIComponent("Ange start och slut.")}`);
  }
  const start = localToIso(`${date}T${from}`);
  let end = localToIso(`${date}T${to}`);
  if (end <= start) end = new Date(new Date(end).getTime() + 86_400_000).toISOString();
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_report_time", {
    p_shift: shiftId,
    p_start: start,
    p_end: end,
    p_break: Math.max(0, Math.round(Number(fd.get("break") ?? 0)) || 0),
    p_comment: String(fd.get("comment") ?? ""),
  });
  deliverNotifications();
  revalidatePath("/portal");
  redirect(`/portal?flik=${tab}&${data === "ok" ? "rapporterad=1" : `fel=${encodeURIComponent(TIME_MSG[String(data)] ?? "Något gick fel.")}`}#pass-${shiftId}`);
}

/** Sparar enhetens notisprenumeration (anropas från PushToggle). */
export async function savePush(json: string) {
  const sub = JSON.parse(json) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await supabase.from("push_subscriptions").insert({ profile_id: uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
}

export async function removePush(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function saveMyDetails(fd: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_details_save", { p: detailsFromForm(fd) });
  revalidatePath("/portal");
  redirect(`/portal?flik=uppgifter&${data === "ok" ? "sparad=1" : "fel=" + encodeURIComponent("Det gick inte att spara.")}`);
}

export async function addMyUnavailability(fd: FormData) {
  const r = readUnavailability(fd);
  if (!r) redirect(`/portal?flik=ledighet&fel=${encodeURIComponent("Kontrollera dagarna och tiderna.")}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_unavailability_add", { p_from: r!.from, p_to: r!.to, p_note: r!.note });
  revalidatePath("/portal");
  redirect(`/portal?flik=ledighet${data === "ok" ? "" : `&fel=${encodeURIComponent("Det gick inte att spara.")}`}`);
}

export async function removeMyUnavailability(id: string) {
  const supabase = await createClient();
  await supabase.rpc("my_unavailability_delete", { p_id: id });
  revalidatePath("/portal");
  redirect("/portal?flik=ledighet");
}

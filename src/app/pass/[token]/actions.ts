"use server";

import { deliverNotifications } from "@/lib/notiser";
import { detailsFromForm } from "@/components/staff-details-form";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { localToIso } from "@/lib/datum";
import { kickMail } from "@/lib/epost";
import { createClient } from "@/lib/supabase/server";
import { readUnavailability } from "@/lib/ledighet";

const MSG: Record<string, string> = {
  ogiltig: "Länken fungerar inte längre.",
  ej_inbjuden: "Frågan är inte längre öppen.",
  for_sent: "Svarstiden har gått ut, frågan har gått vidare.",
  fullt: "Tyvärr hann passet bli fullt.",
  ej_tilldelad: "Du har inte det här passet.",
  for_tidigt: "Tid kan rapporteras när passet har börjat.",
  attesterad: "Tiden är redan attesterad.",
  last: "Månaden är låst. Kontakta oss.",
  ogiltig_tid: "Kontrollera tiderna.",
  ogiltig_rast: "Rasten kan inte vara längre än passet.",
};

const valid = (token: string, shift: string) => /^[0-9a-f-]{36}$/i.test(token) && /^[0-9a-f-]{36}$/i.test(shift);

export async function respond(token: string, shiftId: string, accept: boolean) {
  if (!valid(token, shiftId)) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.rpc("link_respond", { p_token: token, p_shift: shiftId, p_accept: accept });
  deliverNotifications();
  if (data === "ok") await kickMail();
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?${data === "ok" ? (accept ? "ja=1" : "nej=1") : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}`);
}

export async function reportTime(token: string, shiftId: string, fd: FormData) {
  if (!valid(token, shiftId)) redirect("/");
  const date = String(fd.get("date") ?? "");
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    redirect(`/pass/${token}?fel=${encodeURIComponent("Ange start och slut.")}`);
  }
  const start = localToIso(`${date}T${from}`);
  let end = localToIso(`${date}T${to}`);
  if (end <= start) end = new Date(new Date(end).getTime() + 86_400_000).toISOString();
  const supabase = await createClient();
  const { data } = await supabase.rpc("link_report_time", {
    p_token: token,
    p_shift: shiftId,
    p_start: start,
    p_end: end,
    p_break: Math.max(0, Math.round(Number(fd.get("break") ?? 0)) || 0),
    p_comment: String(fd.get("comment") ?? ""),
  });
  deliverNotifications();
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?${data === "ok" ? "tid=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}#pass-${shiftId}`);
}

export async function saveLinkDetails(token: string, fd: FormData) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.rpc("link_details_save", { p_token: token, p: detailsFromForm(fd) });
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?${data === "ok" ? "uppgifter=1" : "fel=" + encodeURIComponent("Det gick inte att spara.")}#uppgifter`);
}

export async function addLinkUnavailability(token: string, fd: FormData) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect("/");
  const r = readUnavailability(fd);
  if (!r) redirect(`/pass/${token}?fel=${encodeURIComponent("Kontrollera dagarna och tiderna.")}#ledighet`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("link_unavailability_add", { p_token: token, p_from: r!.from, p_to: r!.to, p_note: r!.note });
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?${data === "ok" ? "ledig=1" : `fel=${encodeURIComponent("Det gick inte att spara.")}`}#ledighet`);
}

export async function removeLinkUnavailability(token: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect("/");
  const supabase = await createClient();
  await supabase.rpc("link_unavailability_delete", { p_token: token, p_id: id });
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?ledig=1#ledighet`);
}

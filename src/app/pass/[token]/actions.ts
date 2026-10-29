"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { localToIso } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

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
  revalidatePath(`/pass/${token}`);
  redirect(`/pass/${token}?${data === "ok" ? "tid=1" : `fel=${encodeURIComponent(MSG[String(data)] ?? "Något gick fel.")}`}#pass-${shiftId}`);
}

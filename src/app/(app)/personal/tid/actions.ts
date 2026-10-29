"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireStaffManager } from "@/lib/auth";
import { localToIso } from "@/lib/datum";
import { monthRange } from "@/lib/personal";
import { notify } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

const back = (month: string, q: string) => redirect(`/personal/tid?manad=${month}&${q}`);
const err = (e: { message?: string } | null) => (e?.message?.includes("låst") ? "Månaden är låst." : e?.message?.includes("egen tid") ? "Du kan inte attestera din egen tid." : "Det gick inte att spara.");

export async function attest(month: string, ids: string[]) {
  await requireStaffManager();
  const supabase = await createClient();
  const { error } = await supabase.from("shift_assignments").update({ attest_status: "attesterad", attest_comment: null }).in("id", ids).neq("attest_status", "");
  revalidatePath("/personal/tid");
  back(month, error ? `fel=${encodeURIComponent(err(error))}` : `attesterade=${ids.length}`);
}

/** Attestera alla rapporterade rader i månaden utom de egna. */
export async function attestAll(month: string) {
  const me = await requireStaffManager();
  const supabase = await createClient();
  const { first, next } = monthRange(month);
  const { data } = await supabase
    .from("shift_assignments")
    .select("id, staff!inner(profile_id), shifts!inner(starts_at)")
    .eq("status", "tilldelad")
    .eq("attest_status", "rapporterad")
    .gte("shifts.starts_at", localToIso(`${first}T00:00`))
    .lt("shifts.starts_at", localToIso(`${next}T00:00`));
  const ids = ((data ?? []) as unknown as { id: string; staff: { profile_id: string | null } }[]).filter((r) => r.staff.profile_id !== me.id).map((r) => r.id);
  if (!ids.length) back(month, `fel=${encodeURIComponent("Inget att attestera.")}`);
  await attest(month, ids);
}

export async function reject(month: string, id: string, fd: FormData) {
  await requireStaffManager();
  const supabase = await createClient();
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 500) || "Kontrollera tiden och rapportera igen.";
  const { data, error } = await supabase.from("shift_assignments").update({ attest_status: "avvisad", attest_comment: comment }).eq("id", id).select("staff_id").single();
  if (!error && data) await notify(supabase, { staff: [data.staff_id] }, { title: "Din tid behöver ses över", body: comment, url: "/portal?flik=mina" });
  revalidatePath("/personal/tid");
  back(month, error ? `fel=${encodeURIComponent(err(error))}` : "avvisad=1");
}

/** Planeraren rapporterar eller rättar tiden åt någon. */
export async function setTime(month: string, id: string, fd: FormData) {
  await requireStaffManager();
  const date = String(fd.get("date") ?? "");
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) back(month, `fel=${encodeURIComponent("Ange datum och tider.")}`);
  const start = localToIso(`${date}T${from}`);
  let end = localToIso(`${date}T${to}`);
  if (end <= start) end = new Date(new Date(end).getTime() + 86_400_000).toISOString();
  const brk = Math.max(0, Math.min(600, Math.round(Number(fd.get("break") ?? 0)) || 0));
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_assignments")
    .update({ actual_start: start, actual_end: end, break_minutes: brk, reported_at: new Date().toISOString(), attest_status: "rapporterad", attest_comment: null, report_comment: String(fd.get("comment") ?? "").trim() || null })
    .eq("id", id);
  revalidatePath("/personal/tid");
  back(month, error ? `fel=${encodeURIComponent(err(error))}` : "sparad=1");
}

export async function lockMonth(month: string) {
  const me = await requireStaffManager();
  const supabase = await createClient();
  const { error } = await supabase.from("time_periods").upsert({ month: `${month}-01`, locked_at: new Date().toISOString(), locked_by: me.id });
  revalidatePath("/personal/tid");
  back(month, error ? `fel=${encodeURIComponent("Det gick inte att låsa månaden.")}` : "last=1");
}

export async function unlockMonth(month: string) {
  const me = await requireStaffManager();
  if (!isAdmin(me)) back(month, `fel=${encodeURIComponent("Bara administratörer kan låsa upp en månad.")}`);
  const supabase = await createClient();
  await supabase.from("time_periods").update({ locked_at: null, locked_by: null }).eq("month", `${month}-01`);
  revalidatePath("/personal/tid");
  back(month, "upplast=1");
}

export async function savePayrollEmail(month: string, fd: FormData) {
  const me = await requireStaffManager();
  if (!isAdmin(me)) back(month, `fel=${encodeURIComponent("Bara administratörer kan ändra adressen.")}`);
  const email = String(fd.get("payroll_email") ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({ key: "payroll_email", value: email, updated_at: new Date().toISOString() });
  revalidatePath("/personal/tid");
  back(month, "sparad=1");
}

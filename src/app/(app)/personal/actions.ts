"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth";
import { addDays, localToIso } from "@/lib/datum";
import { kickMail } from "@/lib/epost";
import { notify, shiftLabel } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { readUnavailability } from "@/lib/ledighet";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = opt(v);
  if (s == null) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}fel=${encodeURIComponent(msg)}`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function refresh(...paths: string[]) {
  revalidatePath("/personal", "layout");
  for (const p of paths) revalidatePath(p);
}

/** Datum + från/till. Slutar man före eller samma tid som man börjar gäller nästa dag. */
function readTimes(fd: FormData, back: string) {
  const date = opt(fd.get("date"));
  const from = opt(fd.get("from"));
  const to = opt(fd.get("to"));
  if (!date || !DATE.test(date) || !from || !TIME.test(from) || !to || !TIME.test(to)) fail(back, "Ange datum och tider.");
  return {
    starts_at: localToIso(`${date}T${from}`),
    ends_at: localToIso(`${to! <= from! ? addDays(date!, 1) : date}T${to}`),
  };
}

function readShift(fd: FormData, back: string) {
  const function_id = opt(fd.get("function_id"));
  if (!function_id) fail(back, "Välj en funktion.");
  const needed = Math.round(num(fd.get("needed")) ?? 1);
  const kind = String(fd.get("staff_kind") ?? "intern");
  const status = String(fd.get("status") ?? "oppen");
  return {
    ...readTimes(fd, back),
    function_id: function_id!,
    needed: Math.min(500, Math.max(1, needed)),
    event_id: opt(fd.get("event_id")),
    room_id: opt(fd.get("room_id")),
    title: opt(fd.get("title")),
    note: opt(fd.get("note")),
    staff_kind: ["intern", "frilans", "leverantor"].includes(kind) ? kind : "intern",
    supplier_id: opt(fd.get("supplier_id")),
    status: ["utkast", "oppen", "stangd"].includes(status) ? status : "oppen",
    hourly_rate: num(fd.get("hourly_rate")),
    respond_hours: Math.min(336, Math.max(1, Math.round(num(fd.get("respond_hours")) ?? 24))),
  };
}

// ---------------------------------------------------------------------------
// Pass
// ---------------------------------------------------------------------------

export async function createShift(fd: FormData) {
  await requireStaffManager();
  const back = opt(fd.get("back")) ?? "/personal";
  const shift = readShift(fd, back);
  const copies = Math.min(14, Math.max(1, Math.round(num(fd.get("days")) ?? 1)));
  const supabase = await createClient();
  // "Antal dagar i rad" skapar samma pass flera dagar efter varandra.
  const rows = Array.from({ length: copies }, (_, i) => ({
    ...shift,
    starts_at: new Date(new Date(shift.starts_at).getTime() + i * 86_400_000).toISOString(),
    ends_at: new Date(new Date(shift.ends_at).getTime() + i * 86_400_000).toISOString(),
  }));
  const { data, error } = await supabase.from("shifts").insert(rows).select("id");
  if (error || !data?.length) fail(back, "Det gick inte att skapa passet.");
  if (shift.staff_kind === "leverantor" && shift.supplier_id) await kickMail();
  if (shift.status === "oppen" && shift.staff_kind === "intern") {
    const { text } = await shiftLabel(supabase, data![0].id);
    await notify(
      supabase,
      { functionId: shift.function_id },
      { title: data!.length > 1 ? `${data!.length} nya pass att söka` : "Nytt pass att söka", body: text, url: "/portal?flik=lediga", tag: `nytt-${data![0].id}` },
    );
  }
  refresh(back, ...(shift.event_id ? [`/evenemang/${shift.event_id}`] : []));
  if (fd.get("open_after") === "1" && data!.length === 1) redirect(`/personal/pass/${data![0].id}?ny=1`);
  redirect(`${back}${back.includes("?") ? "&" : "?"}passskapat=${data!.length}#bemanning`);
}

export async function updateShift(id: string, fd: FormData) {
  await requireStaffManager();
  const back = `/personal/pass/${id}`;
  const shift = readShift(fd, back);
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").update(shift).eq("id", id);
  if (error) fail(back, "Det gick inte att spara passet.");
  refresh(back, ...(shift.event_id ? [`/evenemang/${shift.event_id}`] : []));
  redirect(`${back}?sparat=1`);
}

export async function deleteShift(id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  const { data } = await supabase.from("shifts").select("event_id").eq("id", id).single();
  await supabase.from("shifts").delete().eq("id", id);
  refresh();
  redirect(data?.event_id ? `/evenemang/${data.event_id}#bemanning` : "/personal");
}

/** Godkänn, neka eller ta bort en person från ett pass. */
export async function decide(shiftId: string, staffId: string, status: "tilldelad" | "nekad" | "aterkallad") {
  const me = await requireStaffManager();
  const back = `/personal/pass/${shiftId}`;
  const supabase = await createClient();
  if (status === "tilldelad") {
    const [{ data: sh }, { count }] = await Promise.all([
      supabase.from("shifts").select("needed").eq("id", shiftId).single(),
      supabase.from("shift_assignments").select("id", { count: "exact", head: true }).eq("shift_id", shiftId).eq("status", "tilldelad"),
    ]);
    if (sh && (count ?? 0) >= sh.needed) fail(back, "Passet är redan fullt. Öka antalet om fler ska med.");
  }
  const { error } = await supabase
    .from("shift_assignments")
    .upsert({ shift_id: shiftId, staff_id: staffId, status, decided_by: me.id, decided_at: new Date().toISOString() }, { onConflict: "shift_id,staff_id" });
  if (error) fail(back, error.message.includes("låst") ? "Månaden är låst." : "Det gick inte att spara.");
  if (status !== "nekad") {
    const { text } = await shiftLabel(supabase, shiftId);
    await notify(
      supabase,
      { staff: [staffId] },
      status === "tilldelad"
        ? { title: "Du har fått ett pass", body: text, url: "/portal?flik=mina", tag: `pass-${shiftId}` }
        : { title: "Du är borttagen från ett pass", body: text, url: "/portal?flik=mina", tag: `pass-${shiftId}` },
    );
  }
  refresh(back);
  redirect(`${back}#personer`);
}

/** Lägg till en person direkt, utan ansökan. */
export async function assignDirectly(shiftId: string, fd: FormData) {
  const staffId = opt(fd.get("staff_id"));
  if (!staffId) fail(`/personal/pass/${shiftId}`, "Välj en person.");
  await decide(shiftId, staffId!, "tilldelad");
}

// ---------------------------------------------------------------------------
// Personer
// ---------------------------------------------------------------------------

function readStaff(fd: FormData) {
  const kind = String(fd.get("kind") ?? "intern");
  return {
    kind: ["intern", "frilans", "leverantor"].includes(kind) ? kind : "intern",
    name: opt(fd.get("name")) ?? "",
    email: opt(fd.get("email"))?.toLowerCase() ?? null,
    phone: opt(fd.get("phone")),
    company: opt(fd.get("company")),
    ...(fd.has("employment_number") ? { employment_number: opt(fd.get("employment_number")) } : {}),
    hourly_rate: num(fd.get("hourly_rate")),
    note: opt(fd.get("note")),
  };
}

async function saveSkills(staffId: string, fd: FormData) {
  const supabase = await createClient();
  const ids = fd.getAll("function_ids").map(String).filter(Boolean);
  await supabase.from("staff_skills").delete().eq("staff_id", staffId);
  if (ids.length) await supabase.from("staff_skills").insert(ids.map((function_id) => ({ staff_id: staffId, function_id })));
}

export async function createStaff(fd: FormData) {
  await requireStaffManager();
  const s = readStaff(fd);
  if (!s.name) fail("/personal/personer", "Ange ett namn.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").insert(s).select("id").single();
  if (error || !data) fail("/personal/personer", error?.code === "23505" ? "E-postadressen finns redan hos en annan person." : "Det gick inte att spara.");
  await saveSkills(data!.id, fd);
  refresh();
  redirect(`/personal/personer/${data!.id}?ny=1`);
}

export async function updateStaff(id: string, fd: FormData) {
  await requireStaffManager();
  const back = `/personal/personer/${id}`;
  const s = readStaff(fd);
  if (!s.name) fail(back, "Ange ett namn.");
  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ ...s, active: fd.get("active") === "on" }).eq("id", id);
  if (error) fail(back, error.code === "23505" ? "E-postadressen finns redan hos en annan person." : "Det gick inte att spara.");
  await saveSkills(id, fd);
  refresh(back);
  redirect(`${back}?sparat=1`);
}

/** Ny personlig länk (den gamla slutar fungera). För frilans och leverantörer. */
export async function newStaffLink(id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("staff").update({ link_token: crypto.randomUUID() }).eq("id", id);
  refresh(`/personal/personer/${id}`);
  redirect(`/personal/personer/${id}?nylank=1`);
}

/** Skapar ett inloggningskonto för internpersonal och returnerar en inbjudningslänk att skicka. */
export async function inviteStaff(id: string) {
  await requireStaffManager();
  const back = `/personal/personer/${id}`;
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fcc-bokning.vercel.app";
  const { data, error } = await supabase.functions.invoke("invite-staff", { body: { staff_id: id, redirect_to: `${site}/logga-in` } });
  if (error || !data?.link) fail(back, data?.error ?? "Det gick inte att skapa inbjudan.");
  refresh(back);
  redirect(`${back}?lank=${encodeURIComponent(data.link)}#portal`);
}

// ---------------------------------------------------------------------------
// Funktioner
// ---------------------------------------------------------------------------

export async function saveFunction(id: string | null, fd: FormData) {
  await requireStaffManager();
  const name = opt(fd.get("name"));
  if (!name) fail("/personal/funktioner", "Ange ett namn.");
  const color = /^#[0-9a-f]{6}$/i.test(String(fd.get("color"))) ? String(fd.get("color")) : "#60272b";
  const row = {
    name,
    color,
    hourly_rate: num(fd.get("hourly_rate")) ?? 0,
    sort_order: Math.round(num(fd.get("sort_order")) ?? 0),
    active: id ? fd.get("active") === "on" : true,
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("staff_functions").update(row).eq("id", id) : await supabase.from("staff_functions").insert(row);
  if (error) fail("/personal/funktioner", "Det gick inte att spara.");
  refresh();
  redirect(`/personal/funktioner?sparat=${encodeURIComponent(name!)}`);
}

// ---------------------------------------------------------------------------
// Inbjudningskedja (frilans)
// ---------------------------------------------------------------------------

export async function addToQueue(shiftId: string, fd: FormData) {
  await requireStaffManager();
  const back = `/personal/pass/${shiftId}`;
  const ids = fd.getAll("staff_id").map(String).filter(Boolean);
  if (!ids.length) fail(back, "Välj minst en person.");
  const supabase = await createClient();
  const { data: cur } = await supabase.from("shift_assignments").select("staff_id, invite_order").eq("shift_id", shiftId);
  const existing = new Set(((cur ?? []) as { staff_id: string }[]).map((x) => x.staff_id));
  let order = Math.max(0, ...((cur ?? []) as { invite_order: number | null }[]).map((x) => x.invite_order ?? 0));
  const rows = ids.filter((id) => !existing.has(id)).map((staff_id) => ({ shift_id: shiftId, staff_id, status: "vantar", invite_order: ++order }));
  if (rows.length) await supabase.from("shift_assignments").insert(rows);
  refresh(back);
  redirect(`${back}#inbjudningar`);
}

export async function moveInQueue(shiftId: string, assignmentId: string, dir: -1 | 1) {
  await requireStaffManager();
  const supabase = await createClient();
  const { data } = await supabase.from("shift_assignments").select("id, invite_order").eq("shift_id", shiftId).eq("status", "vantar").order("invite_order");
  const list = (data ?? []) as { id: string; invite_order: number }[];
  const i = list.findIndex((x) => x.id === assignmentId);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < list.length) {
    await supabase.from("shift_assignments").update({ invite_order: list[j].invite_order }).eq("id", list[i].id);
    await supabase.from("shift_assignments").update({ invite_order: list[i].invite_order }).eq("id", list[j].id);
  }
  refresh(`/personal/pass/${shiftId}`);
  redirect(`/personal/pass/${shiftId}#inbjudningar`);
}

export async function removeFromQueue(shiftId: string, assignmentId: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("shift_assignments").delete().eq("id", assignmentId).in("status", ["vantar", "utgangen", "avbojd"]);
  refresh(`/personal/pass/${shiftId}`);
  redirect(`/personal/pass/${shiftId}#inbjudningar`);
}

/** Skicka frågan till nästa på tur tills passet är fullt. */
export async function sendInvites(shiftId: string) {
  await requireStaffManager();
  const back = `/personal/pass/${shiftId}`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_invites", { p_shift: shiftId });
  if (data) await kickMail();
  refresh(back);
  if (error) fail(back, "Det gick inte att skicka inbjudningarna.");
  redirect(`${back}?inbjudna=${data ?? 0}#inbjudningar`);
}

/** Planeraren lägger in eller tar bort ledighet åt en person. */
export async function addStaffUnavailability(staffId: string, fd: FormData) {
  await requireStaffManager();
  const r = readUnavailability(fd);
  if (!r) redirect(`/personal/personer/${staffId}?fel=${encodeURIComponent("Kontrollera dagarna och tiderna.")}#ledighet`);
  const supabase = await createClient();
  await supabase.from("staff_unavailability").insert({ staff_id: staffId, starts_at: r!.from, ends_at: r!.to, note: r!.note || null });
  revalidatePath(`/personal/personer/${staffId}`);
  redirect(`/personal/personer/${staffId}#ledighet`);
}

export async function removeStaffUnavailability(staffId: string, id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("staff_unavailability").delete().eq("id", id).eq("staff_id", staffId);
  revalidatePath(`/personal/personer/${staffId}`);
  redirect(`/personal/personer/${staffId}#ledighet`);
}

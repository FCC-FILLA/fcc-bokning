"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const opt = (v: FormDataEntryValue | null, max = 2000) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s === "" ? null : s;
};
const uuid = (v: FormDataEntryValue | null) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const date = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}fel=${encodeURIComponent(msg)}`);

// ---------- Tillsyn och underhåll ----------

function taskFields(fd: FormData) {
  const interval = Math.round(Number(fd.get("interval_days")));
  return {
    title: opt(fd.get("title"), 200),
    room_id: uuid(fd.get("room_id")),
    location: opt(fd.get("location"), 200),
    interval_days: interval >= 1 && interval <= 3650 ? interval : 30,
    instructions: opt(fd.get("instructions")),
    assignee_id: uuid(fd.get("assignee_id")),
    supplier_id: uuid(fd.get("supplier_id")),
  };
}

export async function saveTask(id: string | null, fd: FormData) {
  await requireStaffManager();
  const path = "/fastighet/underhall";
  const f = taskFields(fd);
  if (!f.title) fail(path, "Skriv vad som ska göras.");
  const supabase = await createClient();
  const next = date(fd.get("next_due_on"));
  const { data, error } = id
    ? await supabase.from("maintenance_tasks").update({ ...f, ...(next ? { next_due_on: next } : {}), active: fd.get("active") !== "off" }).eq("id", id).select("id").single()
    : await supabase.from("maintenance_tasks").insert({ ...f, ...(next ? { next_due_on: next } : {}) }).select("id").single();
  if (error || !data) fail(path, `Kunde inte spara: ${error?.message ?? "okänt fel"}`);
  revalidatePath("/fastighet", "layout");
  redirect(`${path}#${data!.id}`);
}

export async function deleteTask(id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("maintenance_tasks").delete().eq("id", id);
  revalidatePath("/fastighet", "layout");
  redirect("/fastighet/underhall");
}

export async function taskDone(id: string, fd: FormData) {
  await requireStaffManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("maintenance_done", {
    p_task: id,
    p_done_on: date(fd.get("done_on")),
    p_ok: fd.get("ok") !== "avvikelse",
    p_note: opt(fd.get("note"), 1000),
  });
  if (error) fail("/fastighet/underhall", `Kunde inte spara: ${error.message}`);
  revalidatePath("/fastighet", "layout");
  redirect(`/fastighet/underhall?klar=1#${id}`);
}

// ---------- Mätare ----------

export async function addReading(meterId: string, fd: FormData) {
  await requireStaffManager();
  const path = "/fastighet/matare";
  const value = Number(String(fd.get("value") ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0) fail(path, "Skriv mätarställningen som ett tal.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("meter_readings")
    .upsert({ meter_id: meterId, read_on: date(fd.get("read_on")) ?? undefined, value, note: opt(fd.get("note"), 500) }, { onConflict: "meter_id,read_on" });
  if (error) fail(path, `Kunde inte spara: ${error.message}`);
  revalidatePath(path);
  redirect(`${path}?sparad=1#${meterId}`);
}

export async function deleteReading(id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("meter_readings").delete().eq("id", id);
  revalidatePath("/fastighet/matare");
  redirect("/fastighet/matare");
}

export async function saveMeter(id: string | null, fd: FormData) {
  await requireStaffManager();
  const path = "/fastighet/matare";
  const name = opt(fd.get("name"), 120);
  if (!name) fail(path, "Mätaren behöver ett namn.");
  const kind = String(fd.get("kind") ?? "el");
  const row = {
    name,
    kind: ["el", "vatten", "varme", "kyla", "gas", "annat"].includes(kind) ? kind : "annat",
    unit: opt(fd.get("unit"), 20) ?? "kWh",
    location: opt(fd.get("location"), 200),
    meter_no: opt(fd.get("meter_no"), 60),
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("meters").update({ ...row, active: fd.get("active") !== "off" }).eq("id", id) : await supabase.from("meters").insert(row);
  if (error) fail(path, `Kunde inte spara: ${error.message}`);
  revalidatePath(path);
  redirect(path);
}

// ---------- Leverantörer ----------

export async function saveSupplier(id: string | null, fd: FormData) {
  await requireStaffManager();
  const path = "/fastighet/leverantorer";
  const name = opt(fd.get("name"), 200);
  if (!name) fail(path, "Leverantören behöver ett namn.");
  const row = {
    name,
    area: opt(fd.get("area"), 100),
    contact_name: opt(fd.get("contact_name"), 120),
    phone: opt(fd.get("phone"), 40),
    emergency_phone: opt(fd.get("emergency_phone"), 40),
    email: opt(fd.get("email"), 200),
    contract_no: opt(fd.get("contract_no"), 80),
    contract_ends_on: date(fd.get("contract_ends_on")),
    notes: opt(fd.get("notes")),
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("suppliers").update({ ...row, active: fd.get("active") !== "off" }).eq("id", id).select("id").single()
    : await supabase.from("suppliers").insert(row).select("id").single();
  if (error || !data) fail(path, `Kunde inte spara: ${error?.message ?? "okänt fel"}`);
  revalidatePath("/fastighet", "layout");
  redirect(`${path}#${data!.id}`);
}

export async function deleteSupplier(id: string) {
  await requireStaffManager();
  const supabase = await createClient();
  await supabase.from("suppliers").delete().eq("id", id);
  revalidatePath("/fastighet", "layout");
  redirect("/fastighet/leverantorer");
}

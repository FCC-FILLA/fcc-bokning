"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBooker } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lookupOrg } from "@/lib/bolagsverket";

const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

function readCompany(fd: FormData) {
  return {
    name: opt(fd.get("name")) ?? "",
    org_nr: opt(fd.get("org_nr")),
    email: opt(fd.get("email")),
    phone: opt(fd.get("phone")),
    invoice_address: opt(fd.get("invoice_address")),
    invoice_reference: opt(fd.get("invoice_reference")),
    notes: opt(fd.get("notes")),
    commission_pct: (() => {
      const v = opt(fd.get("commission_pct"));
      const n = v == null ? NaN : Number(v.replace(",", ".").replace("%", ""));
      return Number.isFinite(n) && n > 0 ? Math.min(100, n) : null;
    })(),
    commission_to: opt(fd.get("commission_to")),
    commission_note: opt(fd.get("commission_note")),
    address: opt(fd.get("address")),
    postal_code: opt(fd.get("postal_code")),
    city: opt(fd.get("city")),
    country: opt(fd.get("country")),
    website: opt(fd.get("website")),
    invoice_email: opt(fd.get("invoice_email")),
    categories: [
      ...new Set([
        ...fd.getAll("categories").map(String),
        ...String(fd.get("new_category") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      ]),
    ].slice(0, 20),
  };
}

export async function createCompany(fd: FormData) {
  await requireBooker();
  const company = readCompany(fd);
  if (!company.name) redirect(`/kunder?fel=${encodeURIComponent("Ange kundens namn.")}`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").insert(company).select("id").single();
  if (error) redirect(`/kunder?fel=${encodeURIComponent("Det gick inte att spara kunden.")}`);
  revalidatePath("/kunder");
  redirect(`/kunder/${data.id}`);
}

export async function updateCompany(id: string, fd: FormData) {
  await requireBooker();
  const company = readCompany(fd);
  if (!company.name) redirect(`/kunder/${id}?fel=${encodeURIComponent("Ange kundens namn.")}`);
  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(company).eq("id", id);
  revalidatePath("/kunder");
  redirect(`/kunder/${id}?${error ? `fel=${encodeURIComponent("Det gick inte att spara.")}` : "sparat=1"}`);
}

export async function deleteCompany(id: string) {
  await requireBooker();
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) redirect(`/kunder/${id}?fel=${encodeURIComponent("Det gick inte att ta bort kunden.")}`);
  revalidatePath("/kunder");
  redirect("/kunder");
}

export async function addContact(companyId: string, fd: FormData) {
  await requireBooker();
  const name = opt(fd.get("contact_name"));
  if (!name) redirect(`/kunder/${companyId}?fel=${encodeURIComponent("Ange kontaktpersonens namn.")}#kontakter`);
  const supabase = await createClient();
  await supabase.from("contacts").insert({
    company_id: companyId,
    name,
    title: opt(fd.get("contact_title")),
    email: opt(fd.get("contact_email")),
    phone: opt(fd.get("contact_phone")),
  });
  revalidatePath(`/kunder/${companyId}`);
  redirect(`/kunder/${companyId}#kontakter`);
}

export async function deleteContact(companyId: string, contactId: string) {
  await requireBooker();
  const supabase = await createClient();
  await supabase.from("contacts").delete().eq("id", contactId).eq("company_id", companyId);
  revalidatePath(`/kunder/${companyId}`);
  redirect(`/kunder/${companyId}#kontakter`);
}

/** Hämtar namn och adress från Bolagsverket (anropas från formuläret). */
export async function lookupOrgNr(orgNr: string) {
  await requireBooker();
  return lookupOrg(orgNr);
}

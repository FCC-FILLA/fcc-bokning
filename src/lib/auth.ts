import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Inloggad användares profil, eller null. Hämtas en gång per förfrågan. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  return (data as Profile) ?? null;
});

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/logga-in");
  return p;
}

export const canBook = (p: Profile | null) => !!p && p.active && (p.role === "admin" || p.role === "bokare");
export const isAdmin = (p: Profile | null) => !!p && p.active && p.role === "admin";

/** Används i server actions: stoppar användare som inte får boka. */
export async function requireBooker(): Promise<Profile> {
  const p = await requireProfile();
  if (!canBook(p)) throw new Error("Du har inte behörighet att ändra bokningar.");
  return p;
}

/** Får planera pass, godkänna sökande och attestera tid. */
export const canManageStaff = (p: Profile | null) => !!p && p.active && (p.role === "admin" || p.role === "bokare" || p.role === "produktion");
export const isStaffOnly = (p: Profile | null) => !!p && p.role === "personal";

export async function requireStaffManager(): Promise<Profile> {
  const p = await requireProfile();
  if (!canManageStaff(p)) throw new Error("Du har inte behörighet att planera personal.");
  return p;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoToDate } from "@/lib/datum";
import { driveConfigured, ensureFolder, folderExists } from "@/lib/drive";

/**
 * Projektmapp för ett evenemang i Google Drive:
 *   Huvudmapp / Kundens namn / År / "ÅÅÅÅ-MM-DD Evenemangets namn"
 * Datumet är evenemangets första bokning. Finns mappen redan återanvänds den.
 */
export async function ensureEventFolder(supabase: SupabaseClient, eventId: string): Promise<{ id: string } | { error: string }> {
  if (!driveConfigured()) return { error: "Google Drive är inte kopplat än (GOOGLE_SERVICE_ACCOUNT_JSON saknas i Vercel)." };
  const [{ data: root }, { data: ev }, { data: first }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "drive_root_folder").maybeSingle(),
    supabase.from("events").select("id, title, company_id, drive_folder_id, created_at, companies(id, name, drive_folder_id)").eq("id", eventId).single(),
    supabase.from("bookings").select("starts_at").eq("event_id", eventId).order("starts_at").limit(1).maybeSingle(),
  ]);
  if (!root?.value) return { error: "Ange huvudmappen under Inställningar → Google Drive." };
  if (!ev) return { error: "Evenemanget finns inte." };
  const e = ev as unknown as { id: string; title: string; company_id: string | null; drive_folder_id: string | null; created_at: string; companies: { id: string; name: string; drive_folder_id: string | null } | null };
  try {
    if (e.drive_folder_id && (await folderExists(e.drive_folder_id))) return { id: e.drive_folder_id };

    let companyFolder: string;
    if (e.companies) {
      companyFolder = e.companies.drive_folder_id && (await folderExists(e.companies.drive_folder_id))
        ? e.companies.drive_folder_id
        : await ensureFolder(root.value, e.companies.name);
      if (companyFolder !== e.companies.drive_folder_id) await supabase.from("companies").update({ drive_folder_id: companyFolder }).eq("id", e.companies.id);
    } else {
      companyFolder = await ensureFolder(root.value, "Utan kund");
    }
    const date = isoToDate(first?.starts_at ?? e.created_at);
    const yearFolder = await ensureFolder(companyFolder, date.slice(0, 4));
    const id = await ensureFolder(yearFolder, `${date} ${e.title}`);
    await supabase.from("events").update({ drive_folder_id: id }).eq("id", eventId);
    return { id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Det gick inte att skapa mappen." };
  }
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const SETTING_LABEL: Record<string, string> = {
  look_cover: "Offertens omslag",
  look_logo: "Logga",
  look_about_image: "Offertens textblock",
};

/** Var varje bild används: adress → lista med ställen. */
export async function findUsage(supabase: SupabaseClient) {
  const [{ data: rooms }, { data: articles }, { data: settings }, { data: types }] = await Promise.all([
    supabase.from("rooms").select("name, image_path, gallery"),
    supabase.from("articles").select("name, image_path").not("image_path", "is", null),
    supabase.from("app_settings").select("key, value").in("key", Object.keys(SETTING_LABEL)),
    supabase.from("event_types").select("name, cover_image, about_image"),
  ]);
  const map = new Map<string, string[]>();
  const add = (url: string | null | undefined, where: string) => {
    if (url) map.set(url, [...(map.get(url) ?? []), where]);
  };
  for (const r of (rooms ?? []) as { name: string; image_path: string | null; gallery: string[] }[]) {
    add(r.image_path, r.name);
    for (const g of r.gallery ?? []) add(g, r.name);
  }
  for (const a of (articles ?? []) as { name: string; image_path: string }[]) add(a.image_path, a.name);
  for (const s of (settings ?? []) as { key: string; value: string }[]) add(s.value, SETTING_LABEL[s.key]);
  for (const t of (types ?? []) as { name: string; cover_image: string | null; about_image: string | null }[]) {
    add(t.cover_image, `${t.name} (omslag)`);
    add(t.about_image, `${t.name} (textblock)`);
  }
  return map;
}

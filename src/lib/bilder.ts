import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** FCC:s egna foton som följer med appen (public/lokaler). */
export const FCC_PHOTOS = [
  "stora-salen", "rorstrandssalarna", "rorstrand-1", "rorstrand-2", "rorstrand-3", "rorstrand-4", "rorstrand-5",
  "rorstrand-6", "rorstrand-7", "lounge-1", "lounge-2", "birka", "karlbergssalen",
].map((n) => `/lokaler/${n}.jpg`);

export const isFccPhoto = (p: string) => FCC_PHOTOS.includes(p);

export type LibraryImage = { id: string; url: string; name: string };

/** Alla bilder i bildbanken (Inställningar → Bilder). */
export async function loadLibrary(supabase: SupabaseClient): Promise<LibraryImage[]> {
  const { data } = await supabase.from("media_images").select("id, url, name").order("sort_order").order("created_at");
  return (data ?? []) as LibraryImage[];
}

/** Sant om adressen är en bild i bildbanken. */
export async function inLibrary(supabase: SupabaseClient, url: string) {
  if (!url) return false;
  const { data } = await supabase.from("media_images").select("id").eq("url", url).maybeSingle();
  return !!data;
}

/** Namnet på en bild i banken, för listor och val. */
export const imageName = (lib: LibraryImage[], url: string | null | undefined) =>
  !url ? "" : lib.find((x) => x.url === url)?.name ?? (FCC_PHOTOS.includes(url) ? url.replace("/lokaler/", "").replace(".jpg", "") : "uppladdad bild");

/** Laddar upp en bild till en publik hink, lägger den i bildbanken och returnerar adressen, eller ett felmeddelande. */
export async function uploadImage(supabase: SupabaseClient, bucket: string, prefix: string, file: File, name?: string): Promise<{ url?: string; error?: string }> {
  if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) return { error: "Bilden måste vara JPG, PNG eller WebP och högst 5 MB." };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${prefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: "Det gick inte att ladda upp bilden." };
  const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const label = (name ?? file.name.replace(/\.\w+$/, "").replace(/[-_]+/g, " ")).trim().slice(0, 80) || "Uppladdad bild";
  await supabase.from("media_images").insert({ url, name: label, sort_order: 100 });
  return { url };
}

/** Sökvägen i hinken för en publik adress, eller null om bilden inte ligger där. */
export function storagePath(url: string | null | undefined, bucket: string) {
  return url?.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`))?.[1] ?? null;
}

/** Tar bort en uppladdad bild ur hinken om den ligger där. Bilder i bildbanken lämnas; de tas bort under Inställningar → Bilder. */
export async function removeUploaded(supabase: SupabaseClient, bucket: string, url: string | null | undefined) {
  const p = storagePath(url, bucket);
  if (p && !(await inLibrary(supabase, url!))) await supabase.storage.from(bucket).remove([p]);
}

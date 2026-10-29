import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** FCC:s egna foton som följer med appen (public/lokaler). */
export const FCC_PHOTOS = [
  "stora-salen", "rorstrandssalarna", "rorstrand-1", "rorstrand-2", "rorstrand-3", "rorstrand-4", "rorstrand-5",
  "rorstrand-6", "rorstrand-7", "lounge-1", "lounge-2", "birka", "karlbergssalen",
].map((n) => `/lokaler/${n}.jpg`);

export const isFccPhoto = (p: string) => FCC_PHOTOS.includes(p);

/** Laddar upp en bild till en publik hink och returnerar den publika adressen, eller ett felmeddelande. */
export async function uploadImage(supabase: SupabaseClient, bucket: string, prefix: string, file: File): Promise<{ url?: string; error?: string }> {
  if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) return { error: "Bilden måste vara JPG, PNG eller WebP och högst 5 MB." };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${prefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) return { error: "Det gick inte att ladda upp bilden." };
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

/** Sökvägen i hinken för en publik adress, eller null om bilden inte ligger där. */
export function storagePath(url: string | null | undefined, bucket: string) {
  return url?.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`))?.[1] ?? null;
}

/** Tar bort en uppladdad bild ur hinken om den ligger där (FCC:s egna foton lämnas). */
export async function removeUploaded(supabase: SupabaseClient, bucket: string, url: string | null | undefined) {
  const p = storagePath(url, bucket);
  if (p) await supabase.storage.from(bucket).remove([p]);
}

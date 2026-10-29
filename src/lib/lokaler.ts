import type { Room } from "@/lib/types";

/** Samma regel som rooms_overlap() i databasen: samma lokal, eller den ena ligger inuti den andra. */
export function makeOverlap(rooms: Pick<Room, "id" | "parent_id">[]) {
  const parent = new Map(rooms.map((r) => [r.id, r.parent_id]));
  const ancestors = (id: string) => {
    const out = new Set<string>([id]);
    let p = parent.get(id);
    while (p && !out.has(p)) {
      out.add(p);
      p = parent.get(p);
    }
    return out;
  };
  const cache = new Map<string, Set<string>>();
  const anc = (id: string) => {
    if (!cache.has(id)) cache.set(id, ancestors(id));
    return cache.get(id)!;
  };
  return (a: string, b: string) => a === b || anc(a).has(b) || anc(b).has(a);
}

/** Djup i trädet, för indrag i listor. */
export function depthOf(rooms: Pick<Room, "id" | "parent_id">[], id: string): number {
  const parent = new Map(rooms.map((r) => [r.id, r.parent_id]));
  let d = 0;
  let p = parent.get(id);
  while (p) {
    d++;
    p = parent.get(p);
  }
  return d;
}

type RoomImages = { id: string; parent_id: string | null; image_path: string | null; gallery?: string[] | null; active?: boolean; sort_order?: number };

/** Samma regel som room_images() i databasen: huvudbild, egna extrabilder, sedan dellokalernas huvudbilder. */
export function roomImages(rooms: RoomImages[], id: string): string[] {
  const r = rooms.find((x) => x.id === id);
  if (!r) return [];
  const children = rooms
    .filter((x) => x.parent_id === id && x.active !== false && x.image_path)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((x) => x.image_path!);
  return [...new Set([r.image_path, ...(r.gallery ?? []), ...children].filter((p): p is string => !!p))];
}

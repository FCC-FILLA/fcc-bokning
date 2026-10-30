import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurnitureType } from "@/lib/moblering";

export async function loadFurniture(supabase: SupabaseClient): Promise<FurnitureType[]> {
  const { data } = await supabase.from("furniture_types").select("*").order("sort_order");
  return ((data ?? []) as FurnitureType[]).map((t) => ({ ...t, width_m: Number(t.width_m), depth_m: Number(t.depth_m) }));
}

export type LayoutRow = {
  id: string;
  name: string;
  room_id: string;
  setup_id: string | null;
  event_id: string | null;
  booking_id: string | null;
  items: unknown;
  notes: string | null;
  staff_visible: boolean;
  walls: string[] | null;
  updated_at: string;
  version?: number;
};

import type { SupabaseClient } from "@supabase/supabase-js";

export type EventTypeInfo = { id: string; name: string; color: string };

/** Nyckel för evenemang utan typ i filtren. */
export const NO_TYPE = "_";

export async function loadEventTypes(supabase: SupabaseClient): Promise<EventTypeInfo[]> {
  const { data } = await supabase.from("event_types").select("id, name, color").order("sort_order");
  return ((data ?? []) as { id: string; name: string; color: string | null }[]).map((t) => ({ ...t, color: t.color ?? "#6b6b6b" }));
}

/** Dolda typer från adressen (?dolj=konsert,tv). */
export const hiddenTypes = (v: string | undefined) => new Set((v ?? "").split(",").filter(Boolean));

/** Adressvärdet när en typ tänds eller släcks. */
export function toggleType(hidden: Set<string>, id: string) {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next].join(",");
}

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Company, Contact, EventType, Profile, Room, RoomCapacity, Setup } from "@/lib/types";

/** Listor som formulären behöver: lokaler, möbleringar, kunder, kontakter och personal. */
export const getLookups = cache(async () => {
  const supabase = await createClient();
  const [rooms, setups, caps, types, companies, contacts, profiles] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).order("sort_order"),
    supabase.from("setups").select("*").order("sort_order"),
    supabase.from("room_capacities").select("*"),
    supabase.from("event_types").select("*").order("sort_order"),
    supabase.from("companies").select("*").order("name"),
    supabase.from("contacts").select("*").order("name"),
    supabase.from("profiles").select("*").eq("active", true).order("full_name"),
  ]);
  return {
    rooms: (rooms.data ?? []) as Room[],
    setups: (setups.data ?? []) as Setup[],
    capacities: (caps.data ?? []) as RoomCapacity[],
    eventTypes: (types.data ?? []) as EventType[],
    companies: (companies.data ?? []) as Company[],
    contacts: (contacts.data ?? []) as Contact[],
    profiles: (profiles.data ?? []) as Profile[],
  };
});

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

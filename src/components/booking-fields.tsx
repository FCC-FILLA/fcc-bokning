import { depthOf } from "@/lib/lokaler";
import type { Lookups } from "@/lib/lookups";
import { BookingRows } from "./booking-rows";

/** Bokningsrader med lokaler från databasen. */
export function BookingFields({
  lookups,
  defaultRoom,
  defaultDate,
  defaultFrom,
  defaultTo,
}: {
  lookups: Lookups;
  defaultRoom?: string;
  defaultDate?: string;
  defaultFrom?: string;
  defaultTo?: string;
}) {
  const rooms = lookups.rooms
    .filter((r) => r.bookable)
    .map((r) => {
      const caps = lookups.capacities.filter((c) => c.room_id === r.id).map((c) => c.capacity);
      return { id: r.id, name: r.name, depth: depthOf(lookups.rooms, r.id), maxCap: caps.length ? Math.max(...caps) : null };
    });
  return (
    <BookingRows
      rooms={rooms}
      setups={lookups.setups.map((s) => ({ id: s.id, name: s.name }))}
      defaultRoom={defaultRoom}
      defaultDate={defaultDate}
      defaultFrom={defaultFrom}
      defaultTo={defaultTo}
    />
  );
}

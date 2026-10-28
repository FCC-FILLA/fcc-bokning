import { createClient } from "@/lib/supabase/server";
import { depthOf } from "@/lib/lokaler";
import type { Room, RoomCapacity, Setup } from "@/lib/types";

export const metadata = { title: "Lokaler" };

export default async function RoomsPage() {
  const supabase = await createClient();
  const [{ data: r }, { data: s }, { data: c }] = await Promise.all([
    supabase.from("rooms").select("*").eq("active", true).order("sort_order"),
    supabase.from("setups").select("*").order("sort_order"),
    supabase.from("room_capacities").select("*"),
  ]);
  const rooms = (r ?? []) as Room[];
  const setups = (s ?? []) as Setup[];
  const caps = (c ?? []) as RoomCapacity[];
  const cap = (room: string, setup: string) => caps.find((x) => x.room_id === room && x.setup_id === setup)?.capacity;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Lokaler och kapacitet</h1>
        <p className="text-sm text-muted max-w-2xl">
          Bokar man en hel sal blockeras alla delytor, och tvärtom. Lokaler och kapacitet ändras av en administratör.
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr>
              <th>Lokal</th>
              <th className="text-right">Kvm</th>
              {setups.map((x) => <th key={x.id} className="text-right">{x.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const depth = depthOf(rooms, room.id);
              return (
                <tr key={room.id}>
                  <td style={{ paddingLeft: 12 + depth * 18 }} className={depth ? "text-muted" : "font-semibold"}>
                    {room.name}
                    {room.note && <span className="block text-xs font-normal text-muted">{room.note}</span>}
                    {room.kvm_note && <span className="block text-xs font-normal text-muted">{room.kvm_note}</span>}
                  </td>
                  <td className="text-right">{room.kvm ?? <span className="text-muted">–</span>}</td>
                  {setups.map((x) => {
                    const v = cap(room.id, x.id);
                    return <td key={x.id} className="text-right">{v ? v.toLocaleString("sv-SE") : <span className="text-muted">–</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

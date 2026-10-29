import Image from "next/image";
import Link from "next/link";
import { isAdmin, requireProfile } from "@/lib/auth";
import { depthOf } from "@/lib/lokaler";
import { createClient } from "@/lib/supabase/server";
import type { Room, RoomCapacity, Setup } from "@/lib/types";
import { ArticleIcon } from "@/components/icon";
import { createRoom } from "./actions";

export const metadata = { title: "Lokaler" };

type R = Room & { image_path: string | null; gallery: string[] };

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [{ data: r }, { data: s }, { data: c }] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("setups").select("*").order("sort_order"),
    supabase.from("room_capacities").select("*"),
  ]);
  const all = (r ?? []) as R[];
  const rooms = all.filter((x) => x.active);
  const inactive = all.filter((x) => !x.active);
  const setups = (s ?? []) as Setup[];
  const caps = (c ?? []) as RoomCapacity[];
  const cap = (room: string, setup: string) => caps.find((x) => x.room_id === room && x.setup_id === setup)?.capacity;

  const row = (room: R, depth: number) => (
    <tr key={room.id} className={room.active ? "" : "opacity-60"}>
      <td className="w-14">
        <Link href={`/lokaler/${room.id}`} className="relative grid size-11 place-items-center overflow-hidden rounded-md bg-sunk hover:ring-2 hover:ring-brand">
          {room.image_path ? <Image src={room.image_path} alt="" fill sizes="44px" className="object-cover" /> : <ArticleIcon name="room" className="size-6" />}
          {room.gallery?.length > 0 && <span className="absolute right-0.5 bottom-0.5 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">+{room.gallery.length}</span>}
        </Link>
      </td>
      <td style={{ paddingLeft: 12 + depth * 18 }}>
        <Link href={`/lokaler/${room.id}`} className={`hover:underline underline-offset-2 ${depth ? "" : "font-semibold"}`}>{room.name}</Link>
        {!room.bookable && <span className="ml-2 rounded-full bg-sunk px-2 text-xs text-muted">ej bokningsbar</span>}
        {room.note && <span className="block text-xs text-muted">{room.note}</span>}
        {room.kvm_note && <span className="block text-xs text-muted">{room.kvm_note}</span>}
      </td>
      <td className="text-right tabular-nums">{room.kvm ?? <span className="text-muted">–</span>}</td>
      {setups.map((x) => {
        const v = cap(room.id, x.id);
        return <td key={x.id} className="text-right tabular-nums">{v ? v.toLocaleString("sv-SE") : <span className="text-muted">–</span>}</td>;
      })}
      <td className="text-right">
        <Link href={`/lokaler/${room.id}`} className="btn btn-ghost text-sm px-2">{admin ? "Ändra" : "Visa"}</Link>
      </td>
    </tr>
  );

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Lokaler och kapacitet</h1>
        <p className="text-sm text-muted max-w-2xl">
          Bokar man en hel sal blockeras alla delytor, och tvärtom. Klicka på en lokal för att ändra kvm, kapacitet per möblering, säljtext och bilderna som visas i offerten.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      <div className="card overflow-x-auto">
        <table className="table min-w-[960px]">
          <thead>
            <tr>
              <th />
              <th>Lokal</th>
              <th className="text-right">Kvm</th>
              {setups.map((x) => <th key={x.id} className="text-right">{x.name}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => row(room, depthOf(rooms, room.id)))}
            {admin && inactive.length > 0 && (
              <>
                <tr><td colSpan={setups.length + 4} className="pt-5 text-xs font-semibold uppercase tracking-wide text-muted">Inaktiva lokaler</td></tr>
                {inactive.map((room) => row(room, 0))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {admin && (
        <form action={createRoom} className="card p-5 flex flex-wrap items-end gap-3 max-w-3xl">
          <div className="field grow min-w-56">
            <label className="label" htmlFor="new-name">Ny lokal</label>
            <input className="input" id="new-name" name="name" required placeholder="T.ex. Nya konferensen" />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-parent">Ligger inuti</label>
            <select className="input" id="new-parent" name="parent_id" defaultValue="">
              <option value="">Ingen (egen lokal)</option>
              {rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">Skapa lokal</button>
        </form>
      )}
    </>
  );
}

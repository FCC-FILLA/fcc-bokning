import Link from "next/link";
import { canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { countItems, focusView, parseItems, planFor } from "@/lib/moblering";
import { loadFurniture } from "@/lib/moblering-server";
import { createClient } from "@/lib/supabase/server";
import { LayoutDrawing } from "@/components/layout-drawing";
import { createLayout } from "./actions";

type Row = { id: string; name: string; room_id: string; setup_id: string | null; event_id: string | null; items: unknown; updated_at: string; events: { title: string } | null };
type RoomRow = { id: string; name: string; kvm: number | null; plan: unknown; parent_id: string | null; bookable: boolean };

export default async function LayoutsPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const sp = await searchParams;
  const p = await requireProfile();
  const editor = canManageStaff(p);
  const admin = isAdmin(p);
  const supabase = await createClient();
  const [{ data: l }, { data: rm }, { data: st }, types] = await Promise.all([
    supabase.from("layouts").select("id, name, room_id, setup_id, event_id, items, updated_at, events(title)").order("updated_at", { ascending: false }).limit(200),
    supabase.from("rooms").select("id, name, kvm, plan, parent_id, bookable").eq("active", true).order("sort_order"),
    supabase.from("setups").select("id, name").order("sort_order"),
    loadFurniture(supabase),
  ]);
  const layouts = (l ?? []) as unknown as Row[];
  const rooms = ((rm ?? []) as RoomRow[]).filter((r) => r.kvm);
  const setupName = new Map(((st ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const templates = layouts.filter((x) => !x.event_id);
  const recent = layouts.filter((x) => x.event_id).slice(0, 12);
  const colors = Object.fromEntries(types.map((t) => [t.id, t.color]));

  const card = (x: Row) => {
    const room = rooms.find((r) => r.id === x.room_id);
    const items = parseItems(x.items);
    const { chairs } = countItems(items);
    return (
      <Link key={x.id} href={`/mobleringar/${x.id}`} className="card overflow-hidden hover:shadow-md transition-shadow grid">
        <div className="border-b border-line bg-white">
          <LayoutDrawing plan={planFor(room?.plan, room?.kvm ?? null)} items={items} view={focusView(planFor(room?.plan, room?.kvm ?? null), items)} colors={colors} numbers={false} grid={false} className="block" />
        </div>
        <div className="p-3 grid gap-0.5">
          <span className="font-semibold">{x.name}</span>
          <span className="text-xs text-muted">
            {x.events?.title ? `${x.events.title} · ` : ""}{room?.name ?? "?"}{x.setup_id ? ` · ${setupName.get(x.setup_id)}` : ""} · {chairs} platser · {fmtDate(x.updated_at)}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Möbleringar</h1>
        <p className="text-muted max-w-3xl">
          Ritningar över hur lokalerna ska möbleras. Mallarna är era standarduppställningar per lokal. När ett evenemang ska ritas utgår ni från en mall
          (under evenemangets flik Genomförande), justerar och sparar. Personalen ser ritningen och ställ-listan på sina pass.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      {editor && (
        <form action={createLayout} className="card p-4 flex flex-wrap items-end gap-3">
          <h2 className="w-full font-semibold">Ny mall</h2>
          <div className="field"><label className="label" htmlFor="n-room">Lokal</label>
            <select className="input" id="n-room" name="room_id" required>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
          <div className="field"><label className="label" htmlFor="n-setup">Möblering</label>
            <select className="input" id="n-setup" name="setup_id" defaultValue="">
              <option value="">Ingen vald</option>
              {[...setupName].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select></div>
          <div className="field grow min-w-56"><label className="label" htmlFor="n-name">Namn</label>
            <input className="input" id="n-name" name="name" required placeholder="T.ex. Bankett 200 personer" /></div>
          <button className="btn btn-primary" type="submit">Börja rita</button>
        </form>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Mallar</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted">Inga mallar ännu. Skapa en ovan, till exempel Bankett och Teater för Stora salen och Birka.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{templates.map(card)}</div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Senaste evenemangsritningar</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{recent.map(card)}</div>
        </section>
      )}

      <section className="card p-4 grid gap-2">
        <h2 className="font-semibold">Grundritningar för lokalerna</h2>
        <p className="text-sm text-muted">
          Mått, pelare, dörrar, nödutgångar och fast scen. Saknas grundritning uppskattas måtten från kvm.{admin ? "" : " Bara administratörer kan ändra."}
        </p>
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <Link className={`rounded-full border px-3 py-1 text-sm hover:bg-sunk ${r.plan ? "border-ok text-ok" : "border-line text-muted"}`} href={`/lokaler/${r.id}/ritning`}>
                {r.name}{r.plan ? " ✓" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { FCC_PHOTOS } from "@/lib/bilder";
import { depthOf, roomImages } from "@/lib/lokaler";
import { createClient } from "@/lib/supabase/server";
import type { Room, RoomCapacity, Setup } from "@/lib/types";
import { ImageInput } from "@/components/image-input";
import { addRoomImage, changeRoomImage, updateRoom } from "../actions";

type R = Room & { image_path: string | null; gallery: string[]; sales_text: string | null; name_en?: string | null; sales_text_en?: string | null };

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparad?: string; ny?: string; bild?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [{ data: r }, { data: s }, { data: c }] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("setups").select("*").order("sort_order"),
    supabase.from("room_capacities").select("*").eq("room_id", id),
  ]);
  const all = (r ?? []) as R[];
  const room = all.find((x) => x.id === id);
  if (!room) notFound();
  const setups = (s ?? []) as Setup[];
  const caps = new Map(((c ?? []) as RoomCapacity[]).map((x) => [x.setup_id, x.capacity]));
  const own = [room.image_path, ...(room.gallery ?? [])].filter((p): p is string => !!p);
  const shown = roomImages(all, id);
  const fromChildren = shown.filter((p) => !own.includes(p));
  const parent = all.find((x) => x.id === room.parent_id);
  const children = all.filter((x) => x.parent_id === id);
  // Möjliga överordnade: inte lokalen själv eller någon av dess dellokaler.
  const descendants = new Set<string>([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of all) if (x.parent_id && descendants.has(x.parent_id) && !descendants.has(x.id)) { descendants.add(x.id); grew = true; }
  }
  const parents = all.filter((x) => !descendants.has(x.id) && x.active);

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-2">
        <Link href="/lokaler" className="text-sm text-muted hover:underline">← Lokaler</Link>
        <h1 className="text-2xl font-semibold">{room.name}</h1>
        <p className="text-sm text-muted">
          {parent ? <>Ligger inuti <Link className="underline underline-offset-2" href={`/lokaler/${parent.id}`}>{parent.name}</Link>. </> : null}
          {children.length ? <>Delytor: {children.map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link className="underline underline-offset-2" href={`/lokaler/${x.id}`}>{x.name}</Link></span>)}.</> : null}
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Lokalen är sparad.</p>}
      {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Lokalen är skapad. Fyll i kvm, kapacitet och bilder.</p>}
      {sp.bild && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Bilden är tillagd.</p>}

      <form action={updateRoom.bind(null, id)} className="grid gap-5">
        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Uppgifter</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field"><label className="label" htmlFor="name">Namn</label><input className="input" id="name" name="name" required defaultValue={room.name} /></div>
            <div className="field"><label className="label" htmlFor="name_en">Namn på engelska</label><input className="input" id="name_en" name="name_en" defaultValue={room.name_en ?? ""} placeholder={room.name} /></div>
            <div className="field"><label className="label" htmlFor="short_name">Kortnamn (schemat)</label><input className="input" id="short_name" name="short_name" defaultValue={room.short_name ?? ""} /></div>
            <div className="field">
              <label className="label" htmlFor="parent_id">Ligger inuti</label>
              <select className="input" id="parent_id" name="parent_id" defaultValue={room.parent_id ?? ""}>
                <option value="">Ingen (egen lokal)</option>
                {parents.map((x) => <option key={x.id} value={x.id}>{"   ".repeat(depthOf(all, x.id))}{x.name}</option>)}
              </select>
              <span className="text-xs text-muted">Styr krockkontrollen: bokas den överordnade lokalen blockeras denna, och tvärtom.</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr_120px]">
            <div className="field"><label className="label" htmlFor="kvm">Kvm</label><input className="input text-right" id="kvm" name="kvm" inputMode="decimal" defaultValue={room.kvm ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="kvm_note">Notering om ytan</label><input className="input" id="kvm_note" name="kvm_note" defaultValue={room.kvm_note ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="sort_order">Ordning</label><input className="input text-right" id="sort_order" name="sort_order" inputMode="numeric" defaultValue={room.sort_order} /></div>
          </div>
          <div className="field"><label className="label" htmlFor="note">Intern notering</label><input className="input" id="note" name="note" defaultValue={room.note ?? ""} /></div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="bookable" defaultChecked={room.bookable} /> Går att boka</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={room.active} /> Aktiv (visas i schema och listor)</label>
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-3">
          <legend className="text-lg font-semibold float-left w-full">Kapacitet per möblering</legend>
          <p className="text-sm text-muted -mt-1">Antal personer. Lämna tomt om möbleringen inte går i lokalen.</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
            {setups.map((x) => (
              <div key={x.id} className="field">
                <label className="label" htmlFor={`cap_${x.id}`}>{x.name}</label>
                <input className="input text-right" id={`cap_${x.id}`} name={`cap_${x.id}`} inputMode="numeric" defaultValue={caps.get(x.id) ?? ""} placeholder="–" />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Säljtext i offerten</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="sales_text">Svenska</label>
              <textarea className="input min-h-28" id="sales_text" name="sales_text" maxLength={500} defaultValue={room.sales_text ?? ""} placeholder="En eller två meningar som säljer lokalen." />
            </div>
            <div className="field">
              <label className="label" htmlFor="sales_text_en">Engelska</label>
              <textarea className="input min-h-28" id="sales_text_en" name="sales_text_en" maxLength={500} defaultValue={room.sales_text_en ?? ""} placeholder="Used in quotes in English." />
            </div>
          </div>
        </fieldset>

        {admin && <div><button className="btn btn-primary" type="submit">Spara lokalen</button></div>}
      </form>

      <section id="bilder" className="card p-5 grid gap-4 scroll-mt-28">
        <div>
          <h2 className="text-lg font-semibold">Bilder i offerten</h2>
          <p className="text-sm text-muted">
            Den första bilden är huvudbild. Kunden kan bläddra bland alla i ett bildspel.
            {!own.length && parent ? ` Utan egna bilder används bilderna från ${parent.name}.` : ""}
          </p>
        </div>
        {own.length > 0 ? (
          <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {own.map((img, i) => (
              <li key={img} className="grid gap-2">
                <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-sunk">
                  <Image src={img} alt={`${room.name}, bild ${i + 1}`} fill sizes="240px" className="object-cover" />
                  {i === 0 && <span className="absolute left-2 top-2 rounded-md bg-brand px-2 py-0.5 text-xs font-semibold text-white">Huvudbild</span>}
                </div>
                {admin && (
                  <div className="flex flex-wrap gap-1">
                    {i > 0 && <ImgBtn action={changeRoomImage.bind(null, id, img, "main")} label="Huvudbild" />}
                    {i > 0 && <ImgBtn action={changeRoomImage.bind(null, id, img, "left")} label="←" aria="Flytta vänster" />}
                    {i < own.length - 1 && <ImgBtn action={changeRoomImage.bind(null, id, img, "right")} label="→" aria="Flytta höger" />}
                    <ImgBtn action={changeRoomImage.bind(null, id, img, "remove")} label="Ta bort" danger />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-sunk px-4 py-6 text-center text-sm text-muted">Inga egna bilder ännu.</p>
        )}
        {fromChildren.length > 0 && (
          <p className="text-sm text-muted">I bildspelet visas också delytornas huvudbilder ({fromChildren.length} st).</p>
        )}

        {admin && (
          <form action={addRoomImage.bind(null, id)} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="field">
              <label className="label" htmlFor="photo">Lägg till en av FCC:s bilder</label>
              <select className="input" id="photo" name="photo" defaultValue="">
                <option value="">Välj bild</option>
                {FCC_PHOTOS.filter((p) => !own.includes(p)).map((p) => <option key={p} value={p}>{p.replace("/lokaler/", "")}</option>)}
              </select>
            </div>
            <ImageInput name="image" label="Eller ladda upp en egen" />
            <button className="btn btn-primary" type="submit">Lägg till bild</button>
          </form>
        )}
      </section>
    </div>
  );
}

function ImgBtn({ action, label, aria, danger }: { action: () => Promise<void>; label: string; aria?: string; danger?: boolean }) {
  return (
    <form action={action}>
      <button type="submit" aria-label={aria} className={`btn btn-ghost px-2 py-1 text-xs ${danger ? "text-warn" : ""}`}>{label}</button>
    </form>
  );
}

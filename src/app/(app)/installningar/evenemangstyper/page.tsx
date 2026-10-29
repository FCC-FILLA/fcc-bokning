import Image from "next/image";
import { isAdmin, requireProfile } from "@/lib/auth";
import { imageName, loadLibrary, type LibraryImage } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { ImageInput } from "@/components/image-input";
import { addEventType, deleteEventType, saveEventType } from "./actions";

export const metadata = { title: "Evenemangstyper" };

type EventType = { id: string; name: string; sort_order: number; color: string | null; cover_image: string | null; about_image: string | null };

export default async function EventTypesPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string; borttagen?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [{ data }, library, { data: counts }] = await Promise.all([
    supabase.from("event_types").select("id, name, sort_order, color, cover_image, about_image").order("sort_order"),
    loadLibrary(supabase),
    supabase.from("events").select("event_type_id").not("event_type_id", "is", null),
  ]);
  const types = (data ?? []) as EventType[];
  const used = new Map<string, number>();
  for (const e of (counts ?? []) as { event_type_id: string }[]) used.set(e.event_type_id, (used.get(e.event_type_id) ?? 0) + 1);

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Evenemangstyper</h1>
        <p className="text-sm text-muted max-w-3xl">
          Varje typ har en färg som syns i kalendern och kan ha en egen omslagsbild och bild till textblocket. De används i offerten och på kundens eventsida när evenemanget har den typen.
          Utan egen bild används den allmänna från Inställningar → Offert.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {(sp.sparad || sp.borttagen) && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{sp.borttagen ? "Typen är borttagen." : "Sparat."}</p>}

      {types.map((t) => (
        <form key={t.id} id={`typ-${t.id}`} action={saveEventType.bind(null, t.id)} className="card p-5 grid gap-4 scroll-mt-24">
          <fieldset disabled={!admin} className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="field grow min-w-48"><label className="label" htmlFor={`name-${t.id}`}>Namn</label><input className="input" id={`name-${t.id}`} name="name" defaultValue={t.name} required /></div>
              <div className="field w-24"><label className="label" htmlFor={`color-${t.id}`}>Färg</label><input className="input h-10 p-1" id={`color-${t.id}`} name="color" type="color" defaultValue={t.color ?? "#6b6b6b"} /></div>
              <div className="field w-24"><label className="label" htmlFor={`sort-${t.id}`}>Ordning</label><input className="input" id={`sort-${t.id}`} name="sort_order" type="number" defaultValue={t.sort_order} /></div>
              <span className="text-sm text-muted pb-2">{used.get(t.id) ?? 0} evenemang</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImagePick uid={t.id} field="cover_image" label="Omslagsbild" current={t.cover_image} library={library} fallback="Allmänt omslag" />
              <ImagePick uid={t.id} field="about_image" label="Bild till textblocket" current={t.about_image} library={library} fallback="Allmän bild" />
            </div>
          </fieldset>
          {admin && (
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="submit">Spara</button>
            </div>
          )}
        </form>
      ))}
      {admin && types.filter((t) => !used.get(t.id)).length > 0 && (
        <div className="card p-5 grid gap-2">
          <h2 className="font-semibold">Ta bort en typ som inte används</h2>
          <div className="flex flex-wrap gap-2">
            {types.filter((t) => !used.get(t.id)).map((t) => (
              <form key={t.id} action={deleteEventType.bind(null, t.id)}>
                <ConfirmButton className="btn btn-ghost text-sm" label={t.name} question={`Ta bort ${t.name}?`} confirmLabel="Ta bort" />
              </form>
            ))}
          </div>
        </div>
      )}
      {admin && (
        <form action={addEventType} className="card p-5 flex flex-wrap items-end gap-3">
          <div className="field grow min-w-48"><label className="label" htmlFor="new-type">Ny typ</label><input className="input" id="new-type" name="name" required placeholder="T.ex. Gala" /></div>
          <button className="btn" type="submit">Lägg till</button>
        </form>
      )}
    </div>
  );
}

function ImagePick({ uid, field, label, current, library, fallback }: { uid: string; field: string; label: string; current: string | null; library: LibraryImage[]; fallback: string }) {
  return (
    <div className="grid gap-2 content-start">
      <div className="relative aspect-[3/1] overflow-hidden rounded-lg bg-sunk">
        {current ? <Image src={current} alt="" fill sizes="400px" className="object-cover" /> : <span className="grid h-full place-items-center text-xs text-muted">{fallback}</span>}
      </div>
      <div className="field">
        <label className="label" htmlFor={`${field}-${uid}`}>{label}</label>
        <select className="input" id={`${field}-${uid}`} name={field} defaultValue="keep">
          <option value="keep">Behåll {current ? imageName(library, current) : `(${fallback.toLowerCase()})`}</option>
          <option value="">{fallback}</option>
          {library.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
        </select>
      </div>
      <ImageInput name={`${field}_file`} id={`${field}-${uid}-file`} label="Eller ladda upp en bild" />
    </div>
  );
}

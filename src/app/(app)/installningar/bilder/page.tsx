import Image from "next/image";
import { isAdmin, requireProfile } from "@/lib/auth";
import { loadLibrary } from "@/lib/bilder";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { ImageInput } from "@/components/image-input";
import { addImages, deleteImage, renameImage, replaceImage } from "./actions";
import { findUsage } from "./usage";

export const metadata = { title: "Bilder" };

export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ fel?: string; sparad?: string; bytt?: string; tillagd?: string; borttagen?: string }>;
}) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [library, usage] = await Promise.all([loadLibrary(supabase), findUsage(supabase)]);
  const message = sp.bytt ? "Bilden är utbytt överallt där den används." : sp.tillagd ? "Bilden ligger nu i bildbanken." : sp.borttagen ? "Bilden är borttagen." : sp.sparad ? "Sparat." : null;

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Bilder</h1>
        <p className="text-sm text-muted max-w-3xl">
          Alla bilder som används i systemet: lokaler, artiklar, offertens omslag och evenemangstyper. Byt ut en bild här så ändras den överallt på en gång.
          Bilder som laddas upp på andra ställen hamnar också här.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {message && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{message}</p>}

      {admin && (
        <form action={addImages} className="card p-5 flex flex-wrap items-end gap-4">
          <ImageInput name="images" label="Lägg till en bild i banken" />
          <button className="btn btn-primary" type="submit">Ladda upp</button>
        </form>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {library.map((m) => {
          const used = usage.get(m.url) ?? [];
          return (
            <li key={m.id} id={`bild-${m.id}`} className="card overflow-hidden grid content-start scroll-mt-24">
              <div className="relative aspect-[3/2] bg-sunk">
                <Image src={m.url} alt={m.name} fill sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="p-4 grid gap-3">
                {admin ? (
                  <form action={renameImage.bind(null, m.id)} className="flex gap-2">
                    <input className="input py-1" name="name" defaultValue={m.name} aria-label="Namn på bilden" />
                    <button className="btn btn-ghost text-sm" type="submit">Spara</button>
                  </form>
                ) : (
                  <p className="font-medium">{m.name}</p>
                )}
                <p className="text-xs text-muted">{used.length ? `Används: ${[...new Set(used)].join(", ")}` : "Används inte just nu"}</p>
                {admin && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-brand">Byt ut bilden</summary>
                    <form action={replaceImage.bind(null, m.id)} className="mt-2 grid gap-2">
                      <ImageInput name="file" id={`ny-${m.id}`} label="Ny bild" />
                      <p className="text-xs text-muted">Den nya bilden ersätter den gamla{used.length ? ` på ${used.length} ${used.length === 1 ? "ställe" : "ställen"}` : ""}.</p>
                      <div><button className="btn btn-primary text-sm" type="submit">Byt</button></div>
                    </form>
                  </details>
                )}
                {admin && !used.length && (
                  <form action={deleteImage.bind(null, m.id)}>
                    <ConfirmButton className="btn btn-ghost text-sm text-warn" label="Ta bort" question={`Ta bort ${m.name} ur bildbanken?`} confirmLabel="Ta bort" />
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

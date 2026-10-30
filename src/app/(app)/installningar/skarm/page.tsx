import { headers } from "next/headers";
import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/copy-button";
import { ConfirmButton } from "@/components/confirm-button";
import { rotateScreenToken } from "../actions";

export const metadata = { title: "Kontorsskärm" };

export default async function ScreenSettingsPage({ searchParams }: { searchParams: Promise<{ ny?: string; fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "screen_token").maybeSingle();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const url = data?.value ? `https://${host}/skarm/${data.value}` : null;

  return (
    <div className="grid gap-5 max-w-3xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Kontorsskärm</h1>
        <p className="text-sm text-muted">
          En helskärmsvy för en TV på kontoret: dagens evenemang med tider, lokaler, kund, gäster och bemanning, veckan framåt och vilka
          lokaler som används just nu. Sidan uppdaterar sig själv var femte minut och kräver ingen inloggning.
        </p>
      </div>
      {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Ny nyckel skapad. Den gamla länken fungerar inte längre.</p>}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      {url ? (
        <div className="card p-5 grid gap-3">
          <span className="label">Länk till skärmen</span>
          <code className="rounded-lg bg-sunk px-3 py-2 text-sm break-all">{url}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={url} />
            <a className="btn" href={url} target="_blank" rel="noreferrer">Öppna skärmen</a>
          </div>
          <p className="text-xs text-muted">
            Alla med länken ser evenemangens titlar, tider, lokaler, kundnamn, antal gäster, ansvarig och personalinfo. Priser,
            kontaktuppgifter och interna anteckningar visas inte. Förfrågningar och avbokade evenemang syns inte.
          </p>
        </div>
      ) : (
        <p className="card p-5 text-sm text-muted">Ingen nyckel finns ännu.{admin ? " Skapa en nedan." : " Be en administratör skapa en."}</p>
      )}

      {admin && (
        <form action={rotateScreenToken} className="grid gap-2 justify-items-start">
          {url ? (
            <ConfirmButton
              className="btn"
              label="Byt nyckel"
              question="Den nuvarande länken slutar fungera direkt."
              confirmLabel="Byt nyckel"
            />
          ) : (
            <button className="btn btn-primary" type="submit">Skapa länk</button>
          )}
          <span className="text-xs text-muted">Byt nyckel om länken har spridits till någon som inte ska se bokningarna.</span>
        </form>
      )}
    </div>
  );
}

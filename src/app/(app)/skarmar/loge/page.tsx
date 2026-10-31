import { headers } from "next/headers";
import { isAdmin, requireProfile } from "@/lib/auth";
import { cameraOf } from "@/lib/loge";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/copy-button";
import { ConfirmButton } from "@/components/confirm-button";
import { rotateLogeToken, saveLogeSettings } from "../actions";

export const metadata = { title: "Logeskärm" };

const CAMERA_KIND: Record<string, string> = {
  hls: "HLS-ström (.m3u8)",
  mjpeg: "MJPEG-ström från kameran",
  snapshot: "Stillbild som uppdateras varannan sekund",
  video: "Videofil",
  iframe: "Inbäddad sida (t.ex. YouTube eller kamerans webbsida)",
};

export default async function LogeSettingsPage({ searchParams }: { searchParams: Promise<{ ny?: string; sparad?: string; fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["loge_token", "loge_camera_url", "loge_wifi_name", "loge_wifi_password", "loge_info_sv", "loge_info_en"]);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const url = s.loge_token ? `https://${host}/loge/${s.loge_token}` : null;
  const camera = cameraOf(s.loge_camera_url);
  const insecure = /^http:\/\//i.test(s.loge_camera_url ?? "");

  return (
    <div className="grid gap-5 max-w-3xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Logeskärm</h1>
        <p className="text-sm text-muted">
          En helskärmsvy för TV:n i artisternas loger: välkomsthälsning, dagens körschema med vad som händer nu och härnäst, kamera från
          scenen, Wi-Fi och praktisk info. Växlar mellan svenska och engelska och uppdaterar sig själv varannan minut.
        </p>
      </div>
      {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Ny nyckel skapad. Den gamla länken fungerar inte längre.</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat. Skärmarna visar ändringen inom två minuter.</p>}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      {url ? (
        <div className="card p-5 grid gap-4">
          {[
            { label: "Svenska", href: `${url}?sprak=sv` },
            { label: "Engelska", href: `${url}?sprak=en` },
            { label: "Växlar själv var 20:e sekund", href: `${url}?sprak=vaxla` },
          ].map((l) => (
            <div key={l.href} className="grid gap-2">
              <span className="label">{l.label}</span>
              <code className="rounded-lg bg-sunk px-3 py-2 text-sm break-all">{l.href}</code>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={l.href} />
                <a className="btn" href={l.href} target="_blank" rel="noreferrer">Öppna</a>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">
            Språket kan också bytas med knappen uppe till höger på skärmen. Alla med länken ser dagens evenemang med titel, lokaler och
            körschemats punkter som är markerade som synliga för kund, plus kameran och texterna nedan. Kundnamn, antal gäster, personal,
            priser och interna anteckningar visas inte.
          </p>
        </div>
      ) : (
        <p className="card p-5 text-sm text-muted">Ingen nyckel finns ännu.{admin ? " Skapa en längst ner." : " Be en administratör skapa en."}</p>
      )}

      <form action={saveLogeSettings} className="grid gap-5">
        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="sr-only">Innehåll</legend>
          <div className="field">
            <label className="label" htmlFor="loge_camera_url">Kamera från scenen</label>
            <input className="input" id="loge_camera_url" name="loge_camera_url" type="url" defaultValue={s.loge_camera_url ?? ""} placeholder="https://…" autoComplete="off" />
            <span className="text-xs text-muted">
              Länk till en HLS-ström (.m3u8), en MJPEG-ström eller stillbild från kameran, en YouTube-sändning eller kamerans webbsida.
              Lämna tomt för att visa skärmen utan kamera. En RTSP-länk (t.ex. från UniFi Protect) går inte att visa direkt i en
              webbläsare: kör den genom en omvandlare som go2rtc på husets nät och klistra in omvandlarens https-länk här.
              {camera.kind !== "none" && <> Tolkas som: <b>{CAMERA_KIND[camera.kind]}</b>.</>}
            </span>
            {insecure && (
              <span className="text-xs text-warn">
                Länken börjar med http://. Skärmen ligger på https, och då blockerar webbläsaren oftast kameran. Använd en https-adress
                till kameran om den finns.
              </span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="loge_wifi_name">Wi-Fi, nätverk</label>
              <input className="input" id="loge_wifi_name" name="loge_wifi_name" defaultValue={s.loge_wifi_name ?? ""} autoComplete="off" />
            </div>
            <div className="field">
              <label className="label" htmlFor="loge_wifi_password">Wi-Fi, lösenord</label>
              <input className="input" id="loge_wifi_password" name="loge_wifi_password" defaultValue={s.loge_wifi_password ?? ""} autoComplete="off" />
            </div>
          </div>
          <span className="text-xs text-muted -mt-2">Wi-Fi-rutan visas bara när nätverket är ifyllt.</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="loge_info_sv">Praktisk info, svenska</label>
              <textarea className="input min-h-72 font-mono text-sm" id="loge_info_sv" name="loge_info_sv" defaultValue={s.loge_info_sv ?? ""} />
            </div>
            <div className="field">
              <label className="label" htmlFor="loge_info_en">Praktisk info, engelska</label>
              <textarea className="input min-h-72 font-mono text-sm" id="loge_info_en" name="loge_info_en" defaultValue={s.loge_info_en ?? ""} />
            </div>
          </div>
          <span className="text-xs text-muted -mt-2">
            En rad per punkt. Rader som börjar med <code># </code> blir rubriker. Tänk på telefonnummer till produktionen, cateringtider,
            rökplats, var scenen ligger och vad som gäller vid larm.
          </span>
        </fieldset>
        {admin ? (
          <div><button className="btn btn-primary" type="submit">Spara</button></div>
        ) : (
          <p className="text-sm text-muted">Bara administratörer kan ändra logeskärmen.</p>
        )}
      </form>

      <section className="grid gap-2">
        <h2 className="label">Schemat på skärmen</h2>
        <p className="text-sm text-muted">
          Skärmen visar dagens evenemang, i första hand det som har ett körschema och spelar i Stora salen. Schemat hämtas från
          evenemangets körschema (fliken Genomförande), bara punkter markerade som synliga för kund. Har evenemanget inget körschema visas
          lokalerna och tiderna i stället. Bygg- och rivbokningar visas inte.
        </p>
      </section>

      {admin && (
        <form action={rotateLogeToken} className="grid gap-2 justify-items-start">
          {url ? (
            <ConfirmButton className="btn" label="Byt nyckel" question="De nuvarande länkarna slutar fungera direkt." confirmLabel="Byt nyckel" />
          ) : (
            <button className="btn btn-primary" type="submit">Skapa länk</button>
          )}
          <span className="text-xs text-muted">Byt nyckel om länken har spridits till någon som inte ska se den.</span>
        </form>
      )}
    </div>
  );
}

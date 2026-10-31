import Link from "next/link";
import { headers } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ArticleIcon } from "@/components/icon";

export const metadata = { title: "Skärmar" };

/**
 * Alla skärmvyer på ett ställe. En ny skärmtyp läggs till här, i menyn (src/components/nav.tsx)
 * och med en egen inställningssida under /skarmar/<namn>.
 */
const SCREENS = [
  {
    id: "kontor",
    title: "Kontorsskärm",
    text: "För personalen på kontoret: dagens evenemang med tider, lokaler, kund, gäster och bemanning, veckan framåt och vilka lokaler som används just nu.",
    icon: "clock",
    tokenKey: "screen_token",
    path: "/skarm/",
    facts: ["Svenska", "Uppdateras var 5:e minut"],
  },
  {
    id: "loge",
    title: "Logeskärm",
    text: "För artisternas loger: välkomsthälsning, dagens körschema med nu och nästa, kamera från scenen, Wi-Fi och praktisk info.",
    icon: "stage",
    tokenKey: "loge_token",
    path: "/loge/",
    facts: ["Svenska och engelska", "Uppdateras varannan minut"],
  },
] as const;

export default async function ScreensPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", SCREENS.map((s) => s.tokenKey));
  const tokens = new Map((data ?? []).map((r) => [r.key, r.value]));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Skärmar</h1>
        <p className="text-sm text-muted">
          Helskärmsvyer för TV-apparater i huset. Varje skärm har en egen hemlig länk som fungerar utan inloggning, så att den kan stå
          igång på en TV. Öppna inställningarna för att kopiera länken, ändra innehållet eller byta nyckel.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SCREENS.map((s) => {
          const token = tokens.get(s.tokenKey);
          const url = token ? `https://${host}${s.path}${token}` : null;
          return (
            <li key={s.id} className="card p-5 grid grid-cols-[auto_1fr] gap-4 items-start">
              <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
                <ArticleIcon name={s.icon} className="size-7" />
              </span>
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <Link href={`/skarmar/${s.id}`} className="font-semibold hover:underline">{s.title}</Link>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.facts.map((f) => <span key={f} className="rounded-full bg-sunk px-2 py-0.5 text-xs">{f}</span>)}
                  {!url && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">Ingen länk ännu</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {url && <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">Öppna skärmen</a>}
                  <Link className="btn" href={`/skarmar/${s.id}`}>Inställningar och länk</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

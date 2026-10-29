import Image from "next/image";
import { isAdmin, requireProfile } from "@/lib/auth";
import { imageName, loadLibrary } from "@/lib/bilder";
import { SECTIONS, lookFrom } from "@/lib/offert-doc";
import { createClient } from "@/lib/supabase/server";
import { ImageInput } from "@/components/image-input";
import { saveQuoteSettings } from "../actions";

export const metadata = { title: "Offert" };

const TEXTS = [
  { key: "quote_intro", label: "Inledning", help: "Överst i varje ny offert. Kan ändras per offert.", rows: "min-h-28" },
  { key: "look_closing", label: "Avslutning", help: "Visas efter priserna, före villkoren. Gäller alla offerter direkt.", rows: "min-h-24" },
  { key: "quote_terms", label: "Avtalsvillkor", help: "Kopieras in i varje ny offert och kan ändras per offert.", rows: "min-h-72" },
];

const SHOW = [
  { key: "look_show_rooms", label: "Lokalkort med bild och säljtext" },
  { key: "look_show_program", label: "Programmet dag för dag" },
  { key: "look_show_addons", label: "Tillval" },
  { key: "look_show_images", label: "Bilder på artiklar och lokaler (annars bara ikoner)" },
  { key: "look_show_unit_prices", label: "Antal × à-pris på varje rad" },
  { key: "look_show_group_totals", label: "Summa per grupp i gruppens rubrik" },
];

export default async function QuoteSettingsPage({ searchParams }: { searchParams: Promise<{ sparad?: string; fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const s = new Map(((data ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));
  const cover = s.get("look_cover") ?? "";
  const library = await loadLibrary(supabase);
  const uploadedCover = cover && !library.some((m) => m.url === cover) ? cover : null;
  const look = lookFrom(Object.fromEntries(s), "sv");

  return (
    <div className="grid gap-5 max-w-6xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Offert</h1>
        <p className="text-sm text-muted max-w-3xl">
          Hur offerten ser ut för kunden, på svenska och engelska. Språket väljs per offert. Artikel- och lokalnamn på engelska ändras under
          Prislista och Lokaler.
        </p>
      </div>
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat. Inledning och villkor gäller nya offerter; utseende och avslutning gäller alla direkt.</p>}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {!admin && <p className="text-sm text-muted">Bara administratörer kan ändra här.</p>}
      <div>
        <a className="btn" href="/forhandsvisning/offert" target="_blank" rel="noreferrer">Förhandsgranska med senaste offerten ↗</a>
        <span className="ml-3 text-sm text-muted">Spara först, så syns ändringarna. PDF:en följer samma inställningar.</span>
      </div>

      <form action={saveQuoteSettings} className="grid gap-5">
        <fieldset disabled={!admin} className="card p-5 grid gap-5">
          <legend className="text-lg font-semibold float-left w-full">Texter</legend>
          <div className="hidden md:grid grid-cols-2 gap-4 -mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Svenska</span>
            <span>English</span>
          </div>
          {TEXTS.map((t) => (
            <div key={t.key} className="grid gap-2">
              <div>
                <h3 className="font-semibold">{t.label}</h3>
                <p className="text-xs text-muted">{t.help}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <textarea className={`input ${t.rows}`} name={t.key} aria-label={`${t.label} på svenska`} defaultValue={s.get(t.key) ?? ""} />
                <textarea className={`input ${t.rows}`} name={`${t.key}_en`} aria-label={`${t.label} på engelska`} defaultValue={s.get(`${t.key}_en`) ?? ""} lang="en" />
              </div>
            </div>
          ))}
          <div className="field w-40">
            <label className="label" htmlFor="quote_valid_days">Giltighet i dagar</label>
            <input className="input" id="quote_valid_days" name="quote_valid_days" type="number" min={1} max={365} defaultValue={s.get("quote_valid_days") ?? "30"} />
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-5">
          <legend className="text-lg font-semibold float-left w-full">Utseende</legend>
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="field">
              <label className="label" htmlFor="look_accent">Accentfärg</label>
              <div className="flex items-center gap-2">
                <input type="color" id="look_accent" name="look_accent" defaultValue={look.accent} className="h-10 w-14 cursor-pointer rounded border border-line bg-surface" />
                <span className="text-xs text-muted">Rubriker, knappar, belopp och sidhuvud. FCC:s vinröda är #60272b.</span>
              </div>
            </div>
            <fieldset className="field">
              <legend className="label">Omslag</legend>
              {[["stor", "Stor bild"], ["kompakt", "Kompakt bild"], ["ingen", "Ingen bild, bara färg"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="look_hero" value={v} defaultChecked={look.hero === v} /> {l}</label>
              ))}
            </fieldset>
            <fieldset className="field">
              <legend className="label">Rubriker</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="look_font" value="modern" defaultChecked={look.font === "modern"} /> <span className="font-display">Modern (Jost)</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="look_font" value="klassisk" defaultChecked={look.font === "klassisk"} /> <span style={{ fontFamily: "Georgia, serif" }}>Klassisk (serif)</span></label>
            </fieldset>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr] border-t border-line pt-4">
            <div className="grid gap-2">
              <span className="label">Logga i sidhuvudet</span>
              {look.logo ? (
                <div className="flex items-center gap-3">
                  <span className="relative block h-10 w-40 rounded bg-brand p-1">
                    <Image src={look.logo} alt="Nuvarande logga" fill sizes="160px" className="object-contain" />
                  </span>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="look_logo" value="" /> Ta bort (visa namnet)</label>
                </div>
              ) : (
                <p className="text-sm text-muted">Ingen logga, företagsnamnet visas i stället.</p>
              )}
              <input type="hidden" name="look_logo" value="keep" />
              <ImageInput name="look_logo_file" label="Ladda upp logga (helst vit eller ljus PNG)" />
            </div>
            <fieldset className="grid gap-2">
              <legend className="label mb-1">Ordning på delarna</legend>
              <p className="text-xs text-muted -mt-1">Lägst nummer först. Svarsformuläret ligger alltid sist.</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {look.order.map((id, i) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input className="input w-16 py-1 text-right" type="number" min={1} max={20} name={`order_${id}`} defaultValue={i + 1} aria-label={`Plats för ${SECTIONS.find((x) => x.id === id)?.label}`} />
                    {SECTIONS.find((x) => x.id === id)?.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Eget textblock</legend>
          <p className="text-sm text-muted -mt-1">Till exempel ”Om Filadelfia Convention Center”, hitta hit eller hållbarhet. Visas där du placerar det i ordningen ovan. Tomt = visas inte.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" name="look_about_title" defaultValue={s.get("look_about_title") ?? ""} placeholder="Rubrik på svenska" aria-label="Rubrik på svenska" />
            <input className="input" name="look_about_title_en" defaultValue={s.get("look_about_title_en") ?? ""} placeholder="Heading in English" aria-label="Rubrik på engelska" lang="en" />
            <textarea className="input min-h-32" name="look_about" defaultValue={s.get("look_about") ?? ""} placeholder="Text på svenska" aria-label="Text på svenska" />
            <textarea className="input min-h-32" name="look_about_en" defaultValue={s.get("look_about_en") ?? ""} placeholder="Text in English" aria-label="Text på engelska" lang="en" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="look_about_image">Bild till textblocket</label>
              <select className="input" id="look_about_image" name="look_about_image" defaultValue="keep">
                <option value="keep">Behåll {look.aboutImage ? imageName(library, look.aboutImage) : "(ingen bild)"}</option>
                <option value="">Ingen bild</option>
                {library.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
              </select>
            </div>
            <ImageInput name="look_about_image_file" label="Eller ladda upp en bild" />
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Omslagsbild</legend>
          <p className="text-sm text-muted -mt-1">Den stora bilden överst på kundens sida och i PDF:en. Evenemangstyper kan ha en egen omslagsbild som går före den här (Inställningar → Evenemangstyper).</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
            <CoverOption value="" checked={!cover} label="Första bokade lokalen">
              <span className="grid h-full place-items-center bg-sunk p-3 text-center text-xs text-muted">Bilden från den lokal som bokats först</span>
            </CoverOption>
            {uploadedCover && (
              <CoverOption value={uploadedCover} checked label="Uppladdad bild">
                <Image src={uploadedCover} alt="" fill sizes="200px" className="object-cover" />
              </CoverOption>
            )}
            {library.map((m) => (
              <CoverOption key={m.id} value={m.url} checked={cover === m.url} label={m.name}>
                <Image src={m.url} alt="" fill sizes="200px" className="object-cover" />
              </CoverOption>
            ))}
          </div>
          <div className="max-w-md"><ImageInput name="cover_file" label="Eller ladda upp en egen omslagsbild" /></div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-3">
          <legend className="text-lg font-semibold float-left w-full">Visa i offerten</legend>
          {SHOW.map((x) => (
            <label key={x.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={x.key} defaultChecked={(s.get(x.key) ?? "1") !== "0"} /> {x.label}
            </label>
          ))}
        </fieldset>

        {admin && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
      </form>
    </div>
  );
}

function CoverOption({ value, checked, label, children }: { value: string; checked: boolean; label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 cursor-pointer text-xs">
      <input type="radio" name="look_cover" value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="relative aspect-[3/2] overflow-hidden rounded-lg ring-1 ring-line peer-checked:ring-4 peer-checked:ring-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/50">
        {children}
      </span>
      <span className="truncate peer-checked:font-semibold peer-checked:text-brand">{label}</span>
    </label>
  );
}

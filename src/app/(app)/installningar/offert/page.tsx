import Image from "next/image";
import { isAdmin, requireProfile } from "@/lib/auth";
import { FCC_PHOTOS } from "@/lib/bilder";
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
];

export default async function QuoteSettingsPage({ searchParams }: { searchParams: Promise<{ sparad?: string; fel?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const s = new Map(((data ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));
  const cover = s.get("look_cover") ?? "";
  const uploadedCover = cover && !FCC_PHOTOS.includes(cover) ? cover : null;

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

        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Omslagsbild</legend>
          <p className="text-sm text-muted -mt-1">Den stora bilden överst på kundens sida och i PDF:en.</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5">
            <CoverOption value="" checked={!cover} label="Första bokade lokalen">
              <span className="grid h-full place-items-center bg-sunk p-3 text-center text-xs text-muted">Bilden från den lokal som bokats först</span>
            </CoverOption>
            {uploadedCover && (
              <CoverOption value={uploadedCover} checked label="Uppladdad bild">
                <Image src={uploadedCover} alt="" fill sizes="200px" className="object-cover" />
              </CoverOption>
            )}
            {FCC_PHOTOS.map((p) => (
              <CoverOption key={p} value={p} checked={cover === p} label={p.replace("/lokaler/", "").replace(".jpg", "")}>
                <Image src={p} alt="" fill sizes="200px" className="object-cover" />
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

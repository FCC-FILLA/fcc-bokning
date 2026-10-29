import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { imageName, loadLibrary } from "@/lib/bilder";
import { ICONS, ICON_KEYS } from "@/lib/ikoner";
import { roomImages } from "@/lib/lokaler";
import { createClient } from "@/lib/supabase/server";
import type { Article } from "@/lib/types";
import { ArticleIcon } from "@/components/icon";
import { ImageInput } from "@/components/image-input";
import { LineCard } from "@/components/line-card";
import { saveArticleMedia } from "../actions";

type Room = { id: string; name: string; parent_id: string | null; image_path: string | null; sales_text: string | null };

export default async function ArticleMediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparad?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const library = await loadLibrary(supabase);
  const [{ data: a }, { data: groups }, { data: rooms }] = await Promise.all([
    supabase.from("articles").select("*").eq("id", id).maybeSingle(),
    supabase.from("article_groups").select("id, name, name_en, icon"),
    supabase.from("rooms").select("id, name, parent_id, image_path, gallery, active, sort_order, sales_text, sales_text_en"),
  ]);
  if (!a) notFound();
  const art = a as Article & { name_en: string | null; description_en: string | null };
  const group = ((groups ?? []) as { id: string; name: string; name_en: string | null; icon: string }[]).find((g) => g.id === art.group_id);
  const roomList = (rooms ?? []) as (Room & { gallery: string[]; sales_text_en: string | null })[];
  const room = roomList.find((r) => r.id === art.room_id);
  const parent = roomList.find((r) => r.id === room?.parent_id);
  const roomImage = room?.image_path ?? parent?.image_path ?? null;
  const image = art.image_path ?? roomImage;

  const preview = {
    group: group?.name ?? "",
    group_order: 0,
    description: art.name,
    line_date: null,
    quantity: 1,
    unit: art.unit,
    unit_price: Number(art.price ?? 0),
    discount_pct: 0,
    vat_rate: Number(art.vat_rate),
    kind: "ingar" as const,
    image,
    gallery: room ? roomImages(roomList, room.id) : [],
    icon: art.icon ?? group?.icon ?? "box",
    text: art.description ?? room?.sales_text ?? null,
  };
  const previewEn = {
    ...preview,
    group: group?.name_en ?? preview.group,
    description: art.name_en ?? art.name,
    text: art.description_en ?? room?.sales_text_en ?? null,
  };

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-2">
        <Link href={`/prislista?grupp=${art.group_id}`} className="text-sm text-muted hover:underline">← Prislista</Link>
        <h1 className="text-2xl font-semibold">{art.name}</h1>
        <p className="text-sm text-muted">{group?.name}{art.article_no ? ` · art.nr ${art.article_no}` : ""}{room ? ` · kopplad till ${room.name}` : ""}</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat. Så här ser artikeln ut i kundens offert.</p>}

      <section className="grid gap-2">
        <h2 className="label">Så ser kunden den</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1"><span className="text-xs text-muted">Svenska</span><LineCard line={preview} as="div" /></div>
          <div className="grid gap-1"><span className="text-xs text-muted">Engelska</span><LineCard line={previewEn} as="div" lang="en" /></div>
        </div>
      </section>

      <form action={saveArticleMedia.bind(null, id)} className="grid gap-5">
        <fieldset disabled={!admin} className="card p-5 grid gap-4 md:grid-cols-2">
          <legend className="sr-only">Namn och text till kunden</legend>
          <div className="field md:col-span-2 md:max-w-[calc(50%-0.5rem)] md:col-start-2">
            <label className="label" htmlFor="name_en">Namn på engelska</label>
            <input className="input" id="name_en" name="name_en" maxLength={200} defaultValue={art.name_en ?? ""} placeholder={art.name} />
          </div>
          <div className="field">
            <label className="label" htmlFor="description">Text till kunden, svenska</label>
            <textarea
              className="input min-h-24"
              id="description"
              name="description"
              maxLength={400}
              defaultValue={art.description ?? ""}
              placeholder={room?.sales_text ? `Tomt = lokalens text: ${room.sales_text}` : "T.ex. vad som ingår, i en eller två meningar."}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="description_en">Text till kunden, engelska</label>
            <textarea
              className="input min-h-24"
              id="description_en"
              name="description_en"
              lang="en"
              maxLength={400}
              defaultValue={art.description_en ?? ""}
              placeholder={room?.sales_text_en ? `Empty = room text: ${room.sales_text_en}` : "E.g. what is included, in a sentence or two."}
            />
          </div>
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-4">
          <legend className="text-lg font-semibold float-left w-full">Bild</legend>
          <p className="text-sm text-muted -mt-2">
            Har artikeln en bild visas den i stället för ikonen.
            {roomImage && !art.image_path ? " Just nu används den kopplade lokalens bild." : ""}
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="image_choice">Välj i bildbanken</label>
              <select className="input" id="image_choice" name="image_choice" defaultValue="keep">
                <option value="keep">Behåll {art.image_path ? imageName(library, art.image_path) : roomImage ? "lokalens bild" : "ikonen"}</option>
                <option value="">{roomImage ? "Lokalens bild" : "Ingen bild, visa ikonen"}</option>
                {library.map((m) => <option key={m.id} value={m.url}>{m.name}</option>)}
              </select>
            </div>
            <ImageInput name="image" label="Eller ladda upp en egen bild" />
          </div>
          {art.image_path && (
            <div className="relative h-28 w-44 overflow-hidden rounded-lg bg-sunk">
              <Image src={art.image_path} alt={`Nuvarande bild för ${art.name}`} fill sizes="176px" className="object-cover" />
            </div>
          )}
        </fieldset>

        <fieldset disabled={!admin} className="card p-5 grid gap-3">
          <legend className="text-lg font-semibold float-left w-full">Ikon</legend>
          <p className="text-sm text-muted -mt-1">Visas när artikeln saknar bild, och i PDF:en.</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            <IconOption value="" checked={!art.icon} icon={group?.icon ?? "box"} label={`Gruppens (${group?.name ?? "standard"})`} />
            {ICON_KEYS.map((k) => (
              <IconOption key={k} value={k} checked={art.icon === k} icon={k} label={ICONS[k].label} />
            ))}
          </div>
        </fieldset>

        {admin ? (
          <div><button className="btn btn-primary" type="submit">Spara</button></div>
        ) : (
          <p className="text-sm text-muted">Bara administratörer kan ändra prislistan.</p>
        )}
      </form>
    </div>
  );
}

function IconOption({ value, checked, icon, label }: { value: string; checked: boolean; icon: string; label: string }) {
  return (
    <label className="grid justify-items-center gap-1 rounded-lg border border-line p-2 text-center text-xs cursor-pointer hover:border-muted has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
      <input type="radio" name="icon" value={value} defaultChecked={checked} className="sr-only" />
      <ArticleIcon name={icon} className="size-9" />
      <span className="leading-tight">{label}</span>
    </label>
  );
}

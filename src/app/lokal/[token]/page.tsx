import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { fmtDate } from "@/lib/datum";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/bilder";
import { deliverNotifications } from "@/lib/notiser";
import { createClient } from "@/lib/supabase/server";
import { ImageInput } from "@/components/image-input";

export const metadata: Metadata = { title: "Lokalkort", robots: { index: false } };

type Card = {
  id: string; name: string; kvm: number | null; image: string | null; parent: string | null;
  card_info: string | null; safety_info: string | null; contact_info: string | null;
  blocked: boolean; blocked_reason: string | null; company: string | null;
  capacities: { setup: string; capacity: number }[];
  open_issues: { title: string; created_at: string; status: string }[];
};
const ok = (t: string) => /^[0-9a-f-]{36}$/i.test(t);

async function report(token: string, fd: FormData) {
  "use server";
  if (!ok(token)) redirect("/");
  const supabase = await createClient();
  let photo: string | null = null;
  const file = fd.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) redirect(`/lokal/${token}?fel=bild#fel`);
    const path = `fel/${token}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await supabase.storage.from("felanmalan").upload(path, file, { contentType: file.type });
    if (!error) photo = path;
  }
  const { data } = await supabase.rpc("report_room_issue", {
    p_token: token,
    p_title: String(fd.get("title") ?? ""),
    p_description: String(fd.get("description") ?? ""),
    p_name: String(fd.get("name") ?? ""),
    p_contact: String(fd.get("contact") ?? ""),
    p_photo: photo,
  });
  deliverNotifications();
  redirect(`/lokal/${token}?${data === "ok" ? "tack=1" : `fel=${String(data)}`}#fel`);
}

const ERR: Record<string, string> = { rubrik: "Skriv kort vad som är fel.", for_manga: "Många anmälningar har kommit in nyss. Ring gärna i stället.", bild: "Bilden måste vara JPG, PNG eller WebP och högst 5 MB." };

export default async function RoomCardPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ tack?: string; fel?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!ok(token)) notFound();
  const { data } = await (await createClient()).rpc("room_card", { p_token: token });
  if (!data) notFound();
  const c = data as Card;
  const blocks = [
    { title: "Ljus, ljud och el", text: c.card_info },
    { title: "Säkerhet och nödutgångar", text: c.safety_info },
    { title: "Kontakt", text: c.contact_info },
  ].filter((x) => x.text?.trim());

  return (
    <div className="min-h-dvh bg-bg">
      <header className="relative isolate overflow-hidden bg-brand text-white">
        {c.image && (
          <>
            <Image src={c.image} alt="" fill priority sizes="100vw" className="object-cover -z-20" />
            <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/40 to-black/20" aria-hidden />
          </>
        )}
        <div className="mx-auto max-w-2xl px-4 pt-16 pb-6 grid gap-1">
          <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs">{c.company ?? "Filadelfia Convention Center"}</p>
          <h1 className="font-display text-3xl font-semibold">{c.name}</h1>
          <p className="opacity-90">{[c.parent && `Del av ${c.parent}`, c.kvm && `${c.kvm} kvm`].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5 grid gap-4">
        {c.blocked && (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn font-semibold">Lokalen är spärrad{c.blocked_reason ? `: ${c.blocked_reason}` : "."}</p>
        )}
        {blocks.map((b) => (
          <section key={b.title} className="card p-4 grid gap-1">
            <h2 className="font-display text-lg font-semibold">{b.title}</h2>
            <p className="whitespace-pre-line">{b.text}</p>
          </section>
        ))}
        {c.capacities.length > 0 && (
          <section className="card p-4 grid gap-1">
            <h2 className="font-display text-lg font-semibold">Kapacitet</h2>
            <ul className="grid grid-cols-2 gap-x-4 text-sm">
              {c.capacities.map((x) => <li key={x.setup} className="flex justify-between gap-2"><span>{x.setup}</span><span className="tabular-nums">{x.capacity}</span></li>)}
            </ul>
          </section>
        )}

        <section id="fel" className="card p-4 grid gap-3 scroll-mt-4">
          <h2 className="font-display text-lg font-semibold">Felanmälan</h2>
          {sp.tack && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Tack! Felet är anmält och de ansvariga har fått besked.</p>}
          {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{ERR[sp.fel] ?? "Det gick inte att skicka. Ring gärna i stället."}</p>}
          {c.open_issues.length > 0 && (
            <div className="text-sm">
              <p className="text-muted">Redan anmält:</p>
              <ul className="list-disc pl-5">{c.open_issues.map((x, i) => <li key={i}>{x.title} <span className="text-muted">({fmtDate(x.created_at)}{x.status === "pagaende" ? ", åtgärdas" : ""})</span></li>)}</ul>
            </div>
          )}
          <form action={report.bind(null, token)} className="grid gap-3">
            <div className="field"><label className="label" htmlFor="title">Vad är fel?</label>
              <input className="input" id="title" name="title" required maxLength={200} placeholder="T.ex. trasig lampa, glapp i mikrofon" /></div>
            <div className="field"><label className="label" htmlFor="description">Mer detaljer (valfritt)</label>
              <textarea className="input min-h-20" id="description" name="description" maxLength={2000} /></div>
            <ImageInput name="photo" label="Foto (valfritt)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field"><label className="label" htmlFor="name">Ditt namn</label><input className="input" id="name" name="name" maxLength={80} /></div>
              <div className="field"><label className="label" htmlFor="contact">Telefon eller e-post (valfritt)</label><input className="input" id="contact" name="contact" maxLength={120} /></div>
            </div>
            <div><button className="btn btn-primary" type="submit">Skicka felanmälan</button></div>
          </form>
        </section>
      </main>
    </div>
  );
}

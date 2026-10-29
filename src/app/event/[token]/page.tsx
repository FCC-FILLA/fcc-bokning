import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { lookFrom } from "@/lib/offert-doc";
import { fmtKr } from "@/lib/offert";
import { toCompany } from "@/lib/foretag";
import { createClient } from "@/lib/supabase/server";

type Portal = {
  title: string;
  status: string;
  event_type: string | null;
  participants: number | null;
  description: string | null;
  technical_info: string | null;
  hospitality_info: string | null;
  company_name: string | null;
  contact_name: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  settings: Record<string, string>;
  bookings: { room: string; starts_at: string; ends_at: string }[];
  quotes: { number: number; title: string | null; status: string; share_token: string; sent_at: string | null; accepted_at: string | null; valid_until: string | null; total_ex_vat: number }[];
  checklist: { id: string; title: string; note: string | null; due_date: string | null; can_check: boolean; done_at: string | null; done_by: string | null }[];
  documents: { id: string; name: string; mime: string | null; size: number | null; url: string | null; created_at: string }[];
};

const QUOTE_STATUS: Record<string, string> = { skickad: "Väntar på svar", accepterad: "Accepterad", avbojd: "Avböjd" };
const okToken = (t: string) => /^[0-9a-f-]{36}$/i.test(t);

async function load(token: string) {
  if (!okToken(token)) return null;
  const { data } = await (await createClient()).rpc("event_portal", { p_token: token });
  return (data as Portal | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const doc = await load((await params).token);
  return { title: doc?.title ?? "Evenemang", robots: { index: false, follow: false } };
}

async function check(token: string, item: string, done: boolean, fd: FormData) {
  "use server";
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_portal_check", { p_token: token, p_item: item, p_done: done, p_name: String(fd.get("name") ?? "").slice(0, 80) });
  redirect(`/event/${token}?${data === "ok" ? "bockad=1" : "fel=1"}#checklista`);
}

export default async function EventPortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bockad?: string; fel?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const doc = await load(token);
  if (!doc) notFound();
  const look = lookFrom(doc.settings, "sv");
  const company = toCompany(Object.fromEntries(Object.entries(doc.settings).filter(([k]) => k.startsWith("company_")).map(([k, v]) => [k.slice(8), v])));
  const theme = {
    "--color-brand": look.accent,
    "--color-brand-dark": `color-mix(in srgb, ${look.accent} 75%, black)`,
    "--color-brand-soft": `color-mix(in srgb, ${look.accent} 12%, white)`,
    ...(look.font === "klassisk" ? { "--font-display": 'Georgia, "Times New Roman", serif' } : {}),
  } as CSSProperties;

  const days = new Map<string, Portal["bookings"]>();
  for (const b of doc.bookings) days.set(isoToDate(b.starts_at), [...(days.get(isoToDate(b.starts_at)) ?? []), b]);
  const first = doc.bookings[0]?.starts_at;
  const today = new Date().toISOString().slice(0, 10);
  const open = doc.checklist.filter((x) => !x.done_at);
  const info = [
    { title: "Om evenemanget", text: doc.description },
    { title: "Teknik", text: doc.technical_info },
    { title: "Mat och dryck", text: doc.hospitality_info },
  ].filter((x) => x.text?.trim());

  return (
    <div className="min-h-dvh bg-bg" style={theme}>
      <header className="relative isolate overflow-hidden bg-brand text-white">
        {look.cover && look.hero !== "ingen" && (
          <>
            <Image src={look.cover} alt="" fill priority sizes="100vw" className="object-cover -z-20" />
            <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/40 to-black/20" aria-hidden />
          </>
        )}
        <div className={`mx-auto max-w-3xl px-4 grid gap-3 ${look.cover && look.hero === "stor" ? "pt-28 pb-8 sm:pt-40" : "py-6"}`}>
          {look.logo ? (
            <span className="relative block h-9 w-40"><Image src={look.logo} alt={company.name} fill sizes="160px" className="object-contain object-left" /></span>
          ) : (
            <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs sm:text-sm">{company.name}</p>
          )}
          <h1 className="font-display text-3xl font-semibold">{doc.title}</h1>
          <p className="opacity-90">
            {[doc.company_name, first ? fmtDate(first) : null, doc.participants ? `${doc.participants} gäster` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 grid gap-8">
        {open.length > 0 && (
          <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm">
            <strong>{open.length} {open.length === 1 ? "sak" : "saker"} kvar att göra.</strong>{" "}
            {open.find((x) => x.due_date) ? `Nästa: ${open.find((x) => x.due_date)!.title}, senast ${fmtDate(open.find((x) => x.due_date)!.due_date!)}.` : ""}{" "}
            <a className="font-medium underline" href="#checklista">Till checklistan</a>
          </p>
        )}

        {days.size > 0 && (
          <section className="grid gap-3">
            <h2 className="font-display text-xl font-semibold">Program och lokaler</h2>
            {[...days].map(([date, list]) => (
              <div key={date} className="card p-4 grid gap-1">
                <p className="font-display font-semibold capitalize">{fmtDate(date)}</p>
                <ul className="grid gap-1">
                  {list.map((b, i) => (
                    <li key={i} className="flex gap-3"><span className="tabular-nums w-28 text-muted">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span><span>{b.room}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {info.length > 0 && (
          <section className="grid gap-3">
            {info.map((x) => (
              <div key={x.title} className="grid gap-1">
                <h2 className="font-display text-lg font-semibold">{x.title}</h2>
                <p className="whitespace-pre-line leading-relaxed">{x.text}</p>
              </div>
            ))}
          </section>
        )}

        {doc.quotes.length > 0 && (
          <section className="grid gap-3">
            <h2 className="font-display text-xl font-semibold">Offerter</h2>
            <ul className="card divide-y divide-line">
              {doc.quotes.map((q) => (
                <li key={q.share_token} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <a className="font-medium hover:underline flex-1 min-w-48" href={`/offert/${q.share_token}`}>Offert {q.number}{q.title ? ` · ${q.title}` : ""}</a>
                  <span className="tabular-nums">{fmtKr(q.total_ex_vat)} <span className="text-xs text-muted">exkl. moms</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${q.status === "accepterad" ? "bg-st-genomford-soft text-ok" : "bg-sunk text-muted"}`}>{QUOTE_STATUS[q.status] ?? q.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {doc.checklist.length > 0 && (
          <section id="checklista" className="grid gap-3 scroll-mt-4">
            <h2 className="font-display text-xl font-semibold">Checklista</h2>
            {sp.bockad && <p className="rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">Tack, det är sparat.</p>}
            {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">Det gick inte att spara. Kontakta oss om det fortsätter.</p>}
            <ul className="card divide-y divide-line">
              {doc.checklist.map((x) => {
                const late = !x.done_at && x.due_date && x.due_date < today;
                return (
                  <li key={x.id} className="grid gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-xs ${x.done_at ? "bg-ok border-ok text-white" : "border-muted"}`} aria-hidden>{x.done_at ? "✓" : ""}</span>
                      <span className={`flex-1 min-w-48 ${x.done_at ? "line-through text-muted" : "font-medium"}`}>
                        {x.title}
                        {x.note && <span className="block text-sm font-normal text-muted">{x.note}</span>}
                        {x.done_at && <span className="block text-xs text-muted no-underline">Klar {fmtDate(x.done_at)}{x.done_by ? ` · ${x.done_by}` : ""}</span>}
                      </span>
                      {x.due_date && !x.done_at && <span className={`text-sm tabular-nums ${late ? "text-warn font-semibold" : "text-muted"}`}>senast {fmtDate(x.due_date)}</span>}
                    </div>
                    {x.can_check && (
                      <form action={check.bind(null, token, x.id, !x.done_at)} className="flex flex-wrap items-center gap-2 pl-8">
                        {!x.done_at && <input className="input w-48 py-1 text-sm" name="name" placeholder="Ditt namn" aria-label="Ditt namn" />}
                        <button className={`btn ${x.done_at ? "btn-ghost" : ""} text-sm`} type="submit">{x.done_at ? "Ångra" : "Markera som klar"}</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {doc.documents.length > 0 && (
          <section className="grid gap-3">
            <h2 className="font-display text-xl font-semibold">Dokument</h2>
            <ul className="card divide-y divide-line">
              {doc.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <a className="font-medium hover:underline flex-1 min-w-48 break-all" href={d.url ?? `/event/${token}/fil/${d.id}`}>{d.name}</a>
                  <span className="text-xs text-muted">{fmtDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(doc.responsible_name || company.phone || company.email) && (
          <section className="card p-4 grid gap-1">
            <h2 className="font-display text-lg font-semibold">Kontakt</h2>
            {doc.responsible_name && <p>{doc.responsible_name}{doc.responsible_email && <> · <a className="underline" href={`mailto:${doc.responsible_email}`}>{doc.responsible_email}</a></>}</p>}
            <p className="text-sm text-muted">{[company.name, company.phone, company.email].filter(Boolean).join(" · ")}</p>
          </section>
        )}
        <p className="text-xs text-muted">Den här sidan är till för er som arrangerar. Dela den bara med dem som behöver den.</p>
      </main>
    </div>
  );
}

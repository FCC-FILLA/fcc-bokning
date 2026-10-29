import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { isoToDate } from "@/lib/datum";
import { footerParts } from "@/lib/foretag";
import { lineTotal, quoteTotals } from "@/lib/offert";
import { groupLines, loadPublicDoc, type QuoteDoc } from "@/lib/offert-doc";
import { dayMonth, longDate, money, num, period, strings, timeSpan, weekdayName, type Lang } from "@/lib/sprak";
import { createClient } from "@/lib/supabase/server";
import { Gallery } from "@/components/gallery";
import { ArticleIcon } from "@/components/icon";
import { LineCard } from "@/components/line-card";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const doc = await loadPublicDoc(await createClient(), token);
  return { title: doc ? `${strings(doc.language).quote} ${doc.number}` : "Offert", robots: { index: false, follow: false } };
}

async function respond(token: string, fd: FormData) {
  "use server";
  const accept = fd.get("answer") === "accept";
  if (accept && fd.get("approve") !== "on") redirect(`/offert/${token}?svar=godkann#svara`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("respond_to_quote", {
    p_token: token,
    p_accept: accept,
    p_name: String(fd.get("name") ?? ""),
    p_email: String(fd.get("email") ?? ""),
    p_comment: String(fd.get("comment") ?? ""),
  });
  redirect(`/offert/${token}?svar=${data ?? "fel"}#svara`);
}

const OK_ANSWERS = new Set(["accepterad", "avbojd"]);

/** Bokningarna dag för dag. */
function schedule(bookings: QuoteDoc["bookings"], lang: Lang) {
  const days = new Map<string, { room: string; time: string }[]>();
  for (const b of bookings) {
    const d = isoToDate(b.starts_at);
    days.set(d, [...(days.get(d) ?? []), { room: b.room, time: timeSpan(b.starts_at, b.ends_at, lang) }]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ svar?: string }>;
}) {
  const { token } = await params;
  const { svar } = await searchParams;
  const doc = await loadPublicDoc(await createClient(), token);
  if (!doc) notFound();

  const lang = doc.language;
  const s = strings(lang);
  const look = doc.look;
  const t = quoteTotals(doc.lines);
  const included = groupLines(doc.lines.filter((l) => l.kind === "ingar"));
  const addons = doc.lines.filter((l) => l.kind === "tillval");
  const msg = svar && s.msg[svar] ? { ok: OK_ANSWERS.has(svar), text: s.msg[svar] } : null;
  const today = new Date().toISOString().slice(0, 10);
  const expired = doc.valid_until != null && doc.valid_until < today;
  const open = doc.status === "skickad" && !expired;
  const cover = look.cover || doc.rooms.find((r) => r.image)?.image || "/lokaler/stora-salen.jpg";
  const days = schedule(doc.bookings, lang);
  const when = doc.bookings.length ? period(isoToDate(doc.bookings[0].starts_at), isoToDate(doc.bookings.at(-1)!.starts_at), lang) : null;
  const roomTimes = new Map<string, number>();
  for (const b of doc.bookings) roomTimes.set(b.room, (roomTimes.get(b.room) ?? 0) + 1);

  return (
    <div className="min-h-dvh bg-bg" lang={lang}>
      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-brand-dark text-white">
        <Image src={cover} alt="" fill priority sizes="100vw" className="object-cover -z-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#2a1012] via-[#2a1012]/70 to-[#2a1012]/30" />
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 sm:pb-14 grid gap-16 sm:gap-24">
          <div className="flex items-center justify-between gap-4 text-sm">
            <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs sm:text-sm">{doc.company.name}</p>
            <p className="opacity-85 tabular-nums">{s.quoteNo} {doc.number}</p>
          </div>
          <div className="grid gap-4 max-w-3xl">
            {doc.company_name && <p className="text-sm uppercase tracking-[0.18em] opacity-85">{s.to} {doc.company_name}</p>}
            <h1 className="font-display text-3xl sm:text-5xl font-semibold leading-tight text-balance">{doc.title}</h1>
            <ul className="flex flex-wrap gap-2 text-sm">
              {when && <Chip>{when}</Chip>}
              {doc.participants ? <Chip>{num(doc.participants, lang)} {s.participants}</Chip> : null}
              {doc.rooms.length > 0 && <Chip>{doc.rooms.length === 1 ? doc.rooms[0].name : `${doc.rooms.length} ${s.rooms}`}</Chip>}
            </ul>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10 grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="grid gap-10 min-w-0">
          {doc.status === "accepterad" && (
            <p className="rounded-xl bg-st-genomford-soft px-5 py-4 text-ok">{s.accepted(doc.accepted_at ? longDate(doc.accepted_at, lang) : "", doc.accepted_name ?? "")}</p>
          )}
          {doc.status === "avbojd" && <p className="rounded-xl bg-sunk px-5 py-4">{s.declined}</p>}

          {doc.intro && <p className="whitespace-pre-line text-lg leading-relaxed max-w-prose">{doc.intro}</p>}

          {look.showRooms && doc.rooms.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker={s.kickerRooms}>{s.titleRooms}</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2">
                {doc.rooms.map((r) => (
                  <article key={r.name} className="card overflow-hidden grid content-start">
                    {look.showImages && (
                      <div className="relative aspect-[3/2] bg-sunk">
                        {r.image && (
                          <Gallery
                            images={[r.image, ...r.gallery.filter((g) => g !== r.image)]}
                            alt={r.name}
                            sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
                            lang={lang}
                          />
                        )}
                      </div>
                    )}
                    <div className="p-4 grid gap-2">
                      <h3 className="font-display text-lg font-semibold">{r.name}</h3>
                      <p className="flex flex-wrap gap-x-3 text-sm text-muted">
                        {r.kvm ? <span>{num(r.kvm, lang)} {s.sqm}</span> : null}
                        {r.max ? <span>{s.upTo(num(r.max, lang))}</span> : null}
                        {roomTimes.get(r.name) ? <span>{s.occasions(roomTimes.get(r.name)!)}</span> : null}
                      </p>
                      {r.text && <p className="text-sm leading-relaxed">{r.text}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {look.showProgram && days.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker={s.kickerProgram}>{s.titleProgram}</SectionTitle>
              <ol className="grid gap-3">
                {days.map(([date, slots]) => (
                  <li key={date} className="card p-4 grid gap-2 sm:grid-cols-[150px_1fr]">
                    <div>
                      <p className="font-display font-semibold">{weekdayName(date, lang)}</p>
                      <p className="text-sm text-muted">{dayMonth(date, lang)} {date.slice(0, 4)}</p>
                    </div>
                    <ul className="grid gap-1 text-sm">
                      {slots.map((x, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-x-4 border-b border-line py-1 last:border-0">
                          <span className="font-medium">{x.room}</span>
                          <span className="tabular-nums text-muted">{x.time}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="grid gap-4">
            <SectionTitle kicker={s.kickerPrice}>{s.titlePrice}</SectionTitle>
            <div className="grid gap-6">
              {[...included].map(([group, lines]) => (
                <div key={group} className="grid gap-3">
                  <h3 className="flex items-center gap-2.5 rounded-xl bg-brand px-4 py-3 text-white">
                    <ArticleIcon name="box" className="size-5 opacity-90" strokeWidth={2.6} />
                    <span className="font-display font-semibold uppercase tracking-[0.08em] text-sm">{group}</span>
                    <span className="ml-auto font-semibold tabular-nums">{money(lines.reduce((sum, l) => sum + lineTotal(l), 0), lang)}</span>
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 sm:px-2">
                    {lines.map((l, i) => <LineCard key={i} line={l} lang={lang} images={look.showImages} />)}
                  </ul>
                </div>
              ))}

              <dl className="card grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 p-5 text-sm tabular-nums sm:ml-auto sm:min-w-96">
                {t.discount > 0 && (
                  <>
                    <dt className="text-muted">{s.sumBeforeDiscount}</dt><dd className="text-right">{money(t.beforeDiscount, lang)}</dd>
                    <dt className="text-muted">{s.discount}</dt><dd className="text-right text-ok">−{money(t.discount, lang)}</dd>
                  </>
                )}
                <dt className="text-muted">{s.sumExVat}</dt><dd className="text-right">{money(t.exVat, lang)}</dd>
                <dt className="text-muted">{s.vat}</dt><dd className="text-right">{money(t.vat, lang)}</dd>
                <dt className="font-semibold pt-2 mt-1 border-t border-line">{s.toPay}</dt>
                <dd className="text-right font-display text-2xl font-semibold text-brand pt-2 mt-1 border-t border-line">{money(t.inclVat, lang)}</dd>
              </dl>
            </div>
          </section>

          {look.showAddons && addons.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker={s.kickerAddons}>{s.titleAddons}</SectionTitle>
              <p className="text-sm text-muted -mt-2">{s.addonsNote}</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {addons.map((l, i) => <LineCard key={i} line={l} lang={lang} images={look.showImages} />)}
              </ul>
            </section>
          )}

          {look.closing && <p className="whitespace-pre-line font-display text-xl leading-relaxed text-brand max-w-prose">{look.closing}</p>}

          {doc.terms && (
            <details className="card p-5 group">
              <summary className="cursor-pointer font-semibold list-none flex justify-between">
                {s.terms} <span className="text-muted group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="whitespace-pre-line text-sm text-muted mt-3 max-w-prose">{doc.terms}</p>
            </details>
          )}

          <section id="svara" className="scroll-mt-6 grid gap-3">
            {msg && <p className={`rounded-xl px-5 py-4 ${msg.ok ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>{msg.text}</p>}
            {open && (
              <form action={respond.bind(null, token)} className="card p-5 sm:p-6 grid gap-4 border-t-4 border-t-brand">
                <div>
                  <h2 className="font-display text-2xl font-semibold">{s.respond}</h2>
                  <p className="text-sm text-muted">{s.respondLead}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field">
                    <label className="label" htmlFor="name">{s.name}</label>
                    <input className="input" id="name" name="name" autoComplete="name" required />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="email">{s.email}</label>
                    <input className="input" id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="comment">{s.comment}</label>
                  <textarea className="input" id="comment" name="comment" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="approve" className="mt-1" />
                  <span>{s.approveCheck(doc.company_name ?? s.onBehalfDefault)}</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary px-6" type="submit" name="answer" value="accept">{s.accept}</button>
                  <button className="btn" type="submit" name="answer" value="decline">{s.decline}</button>
                </div>
              </form>
            )}
            {doc.status === "skickad" && expired && <p className="rounded-xl bg-warn-soft px-5 py-4 text-warn">{s.expired(doc.salesperson_name || s.us)}</p>}
          </section>
        </div>

        {/* Sammanfattning */}
        <aside className="grid gap-4 lg:sticky lg:top-6 order-first lg:order-none">
          <div className="card p-5 grid gap-3">
            <span className="label">{s.totalInclVat}</span>
            <span className="font-display text-3xl font-semibold text-brand tabular-nums -mt-2">{money(t.inclVat, lang)}</span>
            <span className="text-sm text-muted -mt-2">{money(t.exVat, lang)} {s.exVat}</span>
            {doc.valid_until && (
              <p className={`text-sm ${expired ? "text-warn" : ""}`}>
                {expired ? s.expiredOn : s.validUntil} {longDate(doc.valid_until, lang)}
              </p>
            )}
            {open && <a href="#svara" className="btn btn-primary">{s.respond}</a>}
            <a className="btn" href={`/offert/${token}/pdf`}>{s.downloadPdf}</a>
          </div>
          <div className="card p-5 grid gap-1 text-sm">
            <span className="label">{s.yourContact}</span>
            <span className="font-semibold">{doc.salesperson_name || doc.company.name}</span>
            {doc.salesperson_email && <a className="break-all underline underline-offset-2" href={`mailto:${doc.salesperson_email}`}>{doc.salesperson_email}</a>}
            {doc.company.phone && <a className="underline underline-offset-2" href={`tel:${doc.company.phone.replace(/[^\d+]/g, "")}`}>{s.switchboard} {doc.company.phone}</a>}
          </div>
        </aside>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted flex flex-wrap justify-between gap-4">
          <div className="grid gap-1">
            {footerParts(doc.company, lang).map((row, i) => <p key={i}>{row.join(" · ")}</p>)}
          </div>
          <span>{s.quoteNo} {doc.number}</span>
        </div>
      </footer>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <li className="rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur px-3 py-1">{children}</li>;
}

function SectionTitle({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{kicker}</p>
      <h2 className="font-display text-2xl font-semibold">{children}</h2>
    </div>
  );
}

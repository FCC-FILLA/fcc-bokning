import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { dayLong, fmtDate, fmtDayMonth, fmtTime, isoToDate } from "@/lib/datum";
import { fmtKr, lineTotal, quoteTotals } from "@/lib/offert";
import { footerParts } from "@/lib/foretag";
import { groupLines, loadPublicDoc, type QuoteDoc } from "@/lib/offert-doc";
import { createClient } from "@/lib/supabase/server";
import { ArticleIcon } from "@/components/icon";
import { LineCard } from "@/components/line-card";

export const metadata: Metadata = { title: "Offert", robots: { index: false, follow: false } };

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

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  accepterad: { ok: true, text: "Tack! Offerten är godkänd. Vi återkommer med bokningsavtal och nästa steg." },
  avbojd: { ok: true, text: "Tack för beskedet. Offerten är markerad som avböjd." },
  ogiltig: { ok: false, text: "Fyll i ditt namn och en giltig e-postadress." },
  godkann: { ok: false, text: "Kryssa i att du godkänner offerten och villkoren." },
  utgangen: { ok: false, text: "Offertens giltighetstid har gått ut. Kontakta oss så hjälper vi dig." },
  ej_tillganglig: { ok: false, text: "Offerten kan inte besvaras längre. Kontakta oss om du har frågor." },
  fel: { ok: false, text: "Något gick fel. Försök igen eller kontakta oss." },
};

/** Bokningarna dag för dag: [{ date, slots: [{ room, from, to }] }]. */
function schedule(bookings: QuoteDoc["bookings"]) {
  const days = new Map<string, { room: string; time: string }[]>();
  for (const b of bookings) {
    const d = isoToDate(b.starts_at);
    const ed = isoToDate(b.ends_at);
    const end = fmtTime(b.ends_at) === "00:00" ? "24:00" : fmtTime(b.ends_at);
    const time = ed === d || end === "24:00" ? `${fmtTime(b.starts_at)}–${end}` : `${fmtTime(b.starts_at)} – ${fmtDayMonth(ed)} ${end}`;
    days.set(d, [...(days.get(d) ?? []), { room: b.room, time }]);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

function period(bookings: QuoteDoc["bookings"]) {
  if (!bookings.length) return null;
  const first = isoToDate(bookings[0].starts_at);
  const last = isoToDate(bookings.at(-1)!.starts_at);
  if (first === last) return fmtDate(first);
  return first.slice(0, 4) === last.slice(0, 4) ? `${fmtDayMonth(first)} – ${fmtDayMonth(last)} ${last.slice(0, 4)}` : `${fmtDate(first)} – ${fmtDate(last)}`;
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

  const t = quoteTotals(doc.lines);
  const included = groupLines(doc.lines.filter((l) => l.kind === "ingar"));
  const addons = doc.lines.filter((l) => l.kind === "tillval");
  const msg = svar ? MESSAGES[svar] : null;
  const today = new Date().toISOString().slice(0, 10);
  const expired = doc.valid_until != null && doc.valid_until < today;
  const open = doc.status === "skickad" && !expired;
  const cover = doc.rooms.find((r) => r.image)?.image ?? "/lokaler/stora-salen.jpg";
  const days = schedule(doc.bookings);
  const when = period(doc.bookings);
  const roomTimes = new Map<string, number>();
  for (const b of doc.bookings) roomTimes.set(b.room, (roomTimes.get(b.room) ?? 0) + 1);

  return (
    <div className="min-h-dvh bg-bg">
      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-brand-dark text-white">
        <Image src={cover} alt="" fill priority sizes="100vw" className="object-cover -z-20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#2a1012] via-[#2a1012]/70 to-[#2a1012]/30" />
        <div className="mx-auto max-w-5xl px-4 pt-6 pb-10 sm:pb-14 grid gap-16 sm:gap-24">
          <div className="flex items-center justify-between gap-4 text-sm">
            <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs sm:text-sm">{doc.company.name}</p>
            <p className="opacity-85 tabular-nums">Offert nr {doc.number}</p>
          </div>
          <div className="grid gap-4 max-w-3xl">
            {doc.company_name && <p className="text-sm uppercase tracking-[0.18em] opacity-85">Till {doc.company_name}</p>}
            <h1 className="font-display text-3xl sm:text-5xl font-semibold leading-tight text-balance">{doc.title}</h1>
            <ul className="flex flex-wrap gap-2 text-sm">
              {when && <Chip>{when}</Chip>}
              {doc.participants ? <Chip>{doc.participants.toLocaleString("sv-SE")} deltagare</Chip> : null}
              {doc.rooms.length > 0 && <Chip>{doc.rooms.length === 1 ? doc.rooms[0].name : `${doc.rooms.length} lokaler`}</Chip>}
            </ul>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10 grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="grid gap-10 min-w-0">
          {doc.status === "accepterad" && (
            <p className="rounded-xl bg-st-genomford-soft px-5 py-4 text-ok">
              Offerten är godkänd {doc.accepted_at ? fmtDate(doc.accepted_at) : ""}
              {doc.accepted_name ? ` av ${doc.accepted_name}` : ""}. Tack! Vi återkommer med bokningsavtal och nästa steg.
            </p>
          )}
          {doc.status === "avbojd" && <p className="rounded-xl bg-sunk px-5 py-4">Offerten är avböjd.</p>}

          {doc.intro && (
            <section className="grid gap-3">
              <p className="whitespace-pre-line text-lg leading-relaxed max-w-prose">{doc.intro}</p>
              {doc.contact_name && <p className="text-muted">Hälsningar till {doc.contact_name}</p>}
            </section>
          )}

          {doc.rooms.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker="Lokaler">Där ni kommer att vara</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2">
                {doc.rooms.map((r) => (
                  <article key={r.name} className="card overflow-hidden grid content-start">
                    <div className="relative aspect-[3/2] bg-sunk">
                      {r.image && <Image src={r.image} alt={r.name} fill sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw" className="object-cover" />}
                    </div>
                    <div className="p-4 grid gap-2">
                      <h3 className="font-display text-lg font-semibold">{r.name}</h3>
                      <p className="flex flex-wrap gap-x-3 text-sm text-muted">
                        {r.kvm ? <span>{r.kvm.toLocaleString("sv-SE")} kvm</span> : null}
                        {r.max ? <span>upp till {r.max.toLocaleString("sv-SE")} personer</span> : null}
                        {roomTimes.get(r.name) ? <span>{roomTimes.get(r.name)} tillfälle{roomTimes.get(r.name) === 1 ? "" : "n"}</span> : null}
                      </p>
                      {r.text && <p className="text-sm leading-relaxed">{r.text}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {days.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker="Program">Dag för dag</SectionTitle>
              <ol className="grid gap-3">
                {days.map(([date, slots]) => (
                  <li key={date} className="card p-4 grid gap-2 sm:grid-cols-[150px_1fr]">
                    <div>
                      <p className="font-display font-semibold">{dayLong(date)}</p>
                      <p className="text-sm text-muted">{fmtDayMonth(date)} {date.slice(0, 4)}</p>
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
            <SectionTitle kicker="Pris">Vad som ingår</SectionTitle>
            <div className="grid gap-6">
              {[...included].map(([group, lines]) => (
                <div key={group} className="grid gap-3">
                  <h3 className="flex items-center gap-2.5 rounded-xl bg-brand px-4 py-3 text-white">
                    <ArticleIcon name="box" className="size-5 opacity-90" strokeWidth={2.6} />
                    <span className="font-display font-semibold uppercase tracking-[0.08em] text-sm">{group}</span>
                    <span className="ml-auto font-semibold tabular-nums">{fmtKr(lines.reduce((s, l) => s + lineTotal(l), 0))}</span>
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 sm:px-2">
                    {lines.map((l, i) => <LineCard key={i} line={l} />)}
                  </ul>
                </div>
              ))}

              <dl className="card grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 p-5 text-sm tabular-nums sm:ml-auto sm:min-w-96">
                {t.discount > 0 && (
                  <>
                    <dt className="text-muted">Summa före rabatt</dt><dd className="text-right">{fmtKr(t.beforeDiscount)}</dd>
                    <dt className="text-muted">Rabatt</dt><dd className="text-right text-ok">−{fmtKr(t.discount)}</dd>
                  </>
                )}
                <dt className="text-muted">Summa exkl. moms</dt><dd className="text-right">{fmtKr(t.exVat)}</dd>
                <dt className="text-muted">Moms</dt><dd className="text-right">{fmtKr(t.vat)}</dd>
                <dt className="font-semibold pt-2 mt-1 border-t border-line">Att betala inkl. moms</dt>
                <dd className="text-right font-display text-2xl font-semibold text-brand pt-2 mt-1 border-t border-line">{fmtKr(t.inclVat)}</dd>
              </dl>
            </div>
          </section>

          {addons.length > 0 && (
            <section className="grid gap-4">
              <SectionTitle kicker="Tillval">Gör det ännu bättre</SectionTitle>
              <p className="text-sm text-muted -mt-2">Ingår inte i summan ovan. Säg till om ni vill lägga till något.</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {addons.map((l, i) => <LineCard key={i} line={l} />)}
              </ul>
            </section>
          )}
          {doc.terms && (
            <details className="card p-5 group">
              <summary className="cursor-pointer font-semibold list-none flex justify-between">
                Villkor <span className="text-muted group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="whitespace-pre-line text-sm text-muted mt-3 max-w-prose">{doc.terms}</p>
            </details>
          )}

          <section id="svara" className="scroll-mt-6 grid gap-3">
            {msg && (
              <p className={`rounded-xl px-5 py-4 ${msg.ok ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>{msg.text}</p>
            )}
            {open && (
              <form action={respond.bind(null, token)} className="card p-5 sm:p-6 grid gap-4 border-t-4 border-t-brand">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Svara på offerten</h2>
                  <p className="text-sm text-muted">Godkänn direkt här, så bokar vi upp lokalerna och skickar bokningsavtalet.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field">
                    <label className="label" htmlFor="name">Ditt namn</label>
                    <input className="input" id="name" name="name" autoComplete="name" required />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="email">E-post</label>
                    <input className="input" id="email" name="email" type="email" autoComplete="email" required />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="comment">Kommentar (valfritt)</label>
                  <textarea className="input" id="comment" name="comment" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="approve" className="mt-1" />
                  <span>Jag godkänner offerten och villkoren och har rätt att göra det för {doc.company_name ?? "vår räkning"}.</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button className="btn btn-primary px-6" type="submit" name="answer" value="accept">Godkänn offerten</button>
                  <button className="btn" type="submit" name="answer" value="decline">Avböj</button>
                </div>
              </form>
            )}
            {doc.status === "skickad" && expired && (
              <p className="rounded-xl bg-warn-soft px-5 py-4 text-warn">
                Offertens giltighetstid har gått ut. Kontakta {doc.salesperson_name || "oss"} så hjälper vi dig.
              </p>
            )}
          </section>
        </div>

        {/* Sammanfattning */}
        <aside className="grid gap-4 lg:sticky lg:top-6 order-first lg:order-none">
          <div className="card p-5 grid gap-3">
            <span className="label">Totalt inkl. moms</span>
            <span className="font-display text-3xl font-semibold text-brand tabular-nums -mt-2">{fmtKr(t.inclVat)}</span>
            <span className="text-sm text-muted -mt-2">{fmtKr(t.exVat)} exkl. moms</span>
            {doc.valid_until && (
              <p className={`text-sm ${expired ? "text-warn" : ""}`}>
                {expired ? "Gick ut" : "Giltig till"} {fmtDate(doc.valid_until)}
              </p>
            )}
            {open && <a href="#svara" className="btn btn-primary">Svara på offerten</a>}
            <a className="btn" href={`/offert/${token}/pdf`}>Ladda ner PDF</a>
          </div>
          <div className="card p-5 grid gap-1 text-sm">
            <span className="label">Er kontakt hos oss</span>
            <span className="font-semibold">{doc.salesperson_name || doc.company.name}</span>
            {doc.salesperson_email && <a className="break-all underline underline-offset-2" href={`mailto:${doc.salesperson_email}`}>{doc.salesperson_email}</a>}
            {doc.company.phone && <a className="underline underline-offset-2" href={`tel:${doc.company.phone.replace(/[^\d+]/g, "")}`}>Växel {doc.company.phone}</a>}
          </div>
        </aside>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted flex flex-wrap justify-between gap-4">
          <div className="grid gap-1">
            {footerParts(doc.company).map((row, i) => (
              <p key={i}>{row.join(" · ")}</p>
            ))}
          </div>
          <span>Offert nr {doc.number}</span>
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

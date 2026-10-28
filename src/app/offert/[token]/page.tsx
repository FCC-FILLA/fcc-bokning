import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, fmtRange } from "@/lib/datum";
import { fmtKr, lineTotal, quoteTotals } from "@/lib/offert";
import { groupLines, loadPublicDoc } from "@/lib/offert-doc";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-brand text-white">
        <div className="mx-auto max-w-4xl px-4 py-5 flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] opacity-80">Filadelfia Convention Center</p>
            <p className="font-display text-3xl font-semibold">Offert</p>
          </div>
          <span className="flex-1" />
          <div className="text-sm text-right opacity-90">
            <p>Nr {doc.number}</p>
            {doc.valid_until && <p>Giltig till {fmtDate(doc.valid_until)}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 grid gap-6">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr] items-start">
          <div className="grid gap-2 min-w-0">
            <h1 className="text-2xl font-semibold">{doc.title}</h1>
            {doc.company_name && (
              <p className="text-muted">
                Till {doc.company_name}
                {doc.contact_name ? `, ${doc.contact_name}` : ""}
              </p>
            )}
            {doc.intro && <p className="whitespace-pre-line max-w-prose">{doc.intro}</p>}
          </div>
          <div className="card p-4 grid gap-1 text-sm">
            <span className="label">Er kontakt hos oss</span>
            <span className="font-semibold">{doc.salesperson_name || "Filadelfia Convention Center"}</span>
            {doc.salesperson_email && <span className="break-all">{doc.salesperson_email}</span>}
            <a className="btn mt-2" href={`/offert/${token}/pdf`}>Ladda ner PDF</a>
          </div>
        </div>

        {doc.status === "accepterad" && (
          <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-ok">
            Godkänd {doc.accepted_at ? fmtDate(doc.accepted_at) : ""}
            {doc.accepted_name ? ` av ${doc.accepted_name}` : ""}. Tack!
          </p>
        )}
        {doc.status === "avbojd" && <p className="rounded-lg bg-sunk px-4 py-3">Offerten är avböjd.</p>}

        {doc.bookings.length > 0 && (
          <section className="card p-5 grid gap-2">
            <h2 className="text-lg font-semibold">Lokaler och tider</h2>
            <ul className="grid gap-1 text-sm">
              {doc.bookings.map((b, i) => (
                <li key={i} className="flex flex-wrap gap-x-4 border-b border-line py-1.5 last:border-0">
                  <span className="font-semibold w-48">{b.room}</span>
                  <span>{fmtRange(b.starts_at, b.ends_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-5 grid gap-5">
          {[...included].map(([group, lines]) => (
            <div key={group} className="grid gap-1">
              <h2 className="font-display font-semibold text-brand border-b border-brand/40 pb-1">{group}</h2>
              <div className="overflow-x-auto">
                <table className="table min-w-[560px]">
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="pl-0">
                          {l.description}
                          {l.line_date && <span className="block text-xs text-muted">{fmtDate(l.line_date)}</span>}
                        </td>
                        <td className="text-right whitespace-nowrap text-muted">
                          {l.quantity.toLocaleString("sv-SE")} {l.unit} × {fmtKr(l.unit_price)}
                        </td>
                        <td className="text-right whitespace-nowrap text-muted">{l.discount_pct ? `−${l.discount_pct} %` : ""}</td>
                        <td className="text-right whitespace-nowrap font-semibold pr-0">{fmtKr(lineTotal(l))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 justify-end text-sm tabular-nums">
            {t.discount > 0 && (
              <>
                <dt className="text-muted text-right">Summa före rabatt</dt><dd className="text-right">{fmtKr(t.beforeDiscount)}</dd>
                <dt className="text-muted text-right">Rabatt</dt><dd className="text-right">−{fmtKr(t.discount)}</dd>
              </>
            )}
            <dt className="text-muted text-right">Summa exkl. moms</dt><dd className="text-right">{fmtKr(t.exVat)}</dd>
            <dt className="text-muted text-right">Moms</dt><dd className="text-right">{fmtKr(t.vat)}</dd>
            <dt className="text-right font-semibold border-t border-line pt-1">Att betala inkl. moms</dt>
            <dd className="text-right font-display text-xl font-semibold text-brand border-t border-line pt-1">{fmtKr(t.inclVat)}</dd>
          </dl>
        </section>

        {addons.length > 0 && (
          <section className="card p-5 grid gap-2">
            <h2 className="text-lg font-semibold">Möjliga tillval</h2>
            <p className="text-sm text-muted">Ingår inte i summan ovan. Säg till om ni vill lägga till något.</p>
            <ul className="grid gap-1 text-sm">
              {addons.map((l, i) => (
                <li key={i} className="flex flex-wrap gap-x-4 border-b border-line py-1.5 last:border-0">
                  <span className="flex-1 min-w-0">{l.description}</span>
                  <span className="text-muted">{l.quantity.toLocaleString("sv-SE")} {l.unit} × {fmtKr(l.unit_price)}</span>
                  <span className="font-semibold w-28 text-right">{fmtKr(lineTotal(l))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {doc.terms && (
          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">Villkor</h2>
            <p className="whitespace-pre-line text-sm text-muted max-w-prose">{doc.terms}</p>
          </section>
        )}

        <section id="svara" className="scroll-mt-6 grid gap-3">
          {msg && (
            <p className={`rounded-lg px-4 py-3 ${msg.ok ? "bg-st-genomford-soft text-ok" : "bg-warn-soft text-warn"}`}>{msg.text}</p>
          )}
          {doc.status === "skickad" && !expired && (
            <form action={respond.bind(null, token)} className="card p-5 grid gap-4">
              <h2 className="text-lg font-semibold">Svara på offerten</h2>
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
                <span>Jag godkänner offerten och villkoren ovan och har rätt att göra det för {doc.company_name ?? "vår räkning"}.</span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary" type="submit" name="answer" value="accept">Godkänn offerten</button>
                <button className="btn" type="submit" name="answer" value="decline">Avböj</button>
              </div>
            </form>
          )}
          {doc.status === "skickad" && expired && (
            <p className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
              Offertens giltighetstid har gått ut. Kontakta {doc.salesperson_name || "oss"} så hjälper vi dig.
            </p>
          )}
        </section>

        <footer className="text-xs text-muted border-t border-line pt-4">
          Filadelfia Convention Center AB · Rörstrandsgatan 5, Stockholm
        </footer>
      </main>
    </div>
  );
}

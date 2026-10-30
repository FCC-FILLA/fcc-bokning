import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { loadCompany } from "@/lib/foretag";
import { deliverNotifications } from "@/lib/notiser";
import { kickMail } from "@/lib/epost";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Er option", robots: { index: false } };

type Info = {
  title: string; status: string; option_expires_on: string | null; customer_response: "vill_boka" | "slapper" | null; customer_response_at: string | null;
  company_name: string | null; contact_name: string | null; responsible_name: string | null; responsible_email: string | null;
  bookings: { room: string; starts_at: string; ends_at: string }[];
};
const ok = (t: string) => /^[0-9a-f-]{36}$/i.test(t);

async function answer(token: string, value: "vill_boka" | "slapper", fd: FormData) {
  "use server";
  if (!ok(token)) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.rpc("option_respond", { p_token: token, p_answer: value, p_name: String(fd.get("name") ?? "") });
  deliverNotifications();
  await kickMail();
  redirect(`/option/${token}?${data === "ok" ? "svar=1" : `fel=${String(data)}`}`);
}

export default async function OptionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ svar?: string; fel?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!ok(token)) notFound();
  const supabase = await createClient();
  const [{ data }, company] = await Promise.all([supabase.rpc("option_info", { p_token: token }), loadCompany(supabase)]);
  if (!data) notFound();
  const d = data as Info;
  const expired = !!d.option_expires_on && d.option_expires_on < new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const open = (d.status === "preliminar" || d.status === "forfragan") && !d.customer_response && !expired;
  const days = new Map<string, Info["bookings"]>();
  for (const b of d.bookings) days.set(isoToDate(b.starts_at), [...(days.get(isoToDate(b.starts_at)) ?? []), b]);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-brand text-white">
        <div className="mx-auto max-w-2xl px-4 py-6 grid gap-2">
          <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs">{company.name}</p>
          <h1 className="font-display text-3xl font-semibold">{d.title}</h1>
          <p className="opacity-90">{[d.company_name, d.option_expires_on && `Option till och med ${fmtDate(d.option_expires_on)}`].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 grid gap-5">
        {sp.fel && (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
            {sp.fel === "utgangen" ? "Optionen har gått ut. Kontakta oss så ser vi om lokalerna fortfarande är lediga." : "Det gick inte att spara svaret. Kontakta oss gärna direkt."}
          </p>
        )}
        {d.customer_response === "vill_boka" && (
          <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-ok">
            Tack! Vi har fått er bekräftelse{d.customer_response_at ? ` ${fmtDate(d.customer_response_at)}` : ""} och återkommer med bokningsbekräftelse.
          </p>
        )}
        {(d.customer_response === "slapper" || d.status === "avbokad") && (
          <p className="rounded-lg bg-sunk px-4 py-3">Optionen är släppt. Tack för beskedet, och välkommen tillbaka en annan gång.</p>
        )}
        {d.status === "bekraftad" && !d.customer_response && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-ok">Bokningen är bekräftad.</p>}

        <section className="card p-5 grid gap-3">
          <h2 className="font-display text-xl font-semibold">Det här håller vi åt er</h2>
          {[...days].map(([date, list]) => (
            <div key={date}>
              <p className="font-semibold capitalize">{fmtDate(date)}</p>
              <ul>{list.map((b, i) => <li key={i} className="flex gap-3"><span className="tabular-nums w-28 text-muted">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>{b.room}</li>)}</ul>
            </div>
          ))}
        </section>

        {open && (
          <section className="card p-5 grid gap-4">
            <h2 className="font-display text-xl font-semibold">Ert svar</h2>
            <p className="text-sm text-muted">
              {d.option_expires_on ? `Optionen gäller till och med ${fmtDate(d.option_expires_on)}. ` : ""}
              Säg gärna till så snart ni vet, så att andra som väntar på samma tid kan få besked.
            </p>
            <div className="field max-w-sm">
              <label className="label" htmlFor="name">Ert namn</label>
              <input className="input" id="name" name="name" form="ja" maxLength={80} defaultValue={d.contact_name ?? ""} />
            </div>
            <div className="flex flex-wrap gap-3">
              <form id="ja" action={answer.bind(null, token, "vill_boka")}>
                <button className="btn btn-primary" type="submit">Vi vill boka</button>
              </form>
              <form action={answer.bind(null, token, "slapper")}>
                <input type="hidden" name="name" value={d.contact_name ?? ""} />
                <button className="btn" type="submit">Släpp optionen</button>
              </form>
            </div>
          </section>
        )}

        {d.responsible_name && (
          <section className="card p-4 grid gap-1 text-sm">
            <p className="font-semibold">Frågor?</p>
            <p>{d.responsible_name}{d.responsible_email && <> · <a className="underline" href={`mailto:${d.responsible_email}`}>{d.responsible_email}</a></>}</p>
          </section>
        )}
      </main>
    </div>
  );
}

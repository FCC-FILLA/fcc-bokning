import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addDays, localToIso, todayDate } from "@/lib/datum";
import { loadCompany } from "@/lib/foretag";
import { kickMail } from "@/lib/epost";
import { deliverNotifications } from "@/lib/notiser";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Förfrågan" };

type Opt = { id: string; name: string };
const ERR: Record<string, string> = {
  kontakt: "Fyll i namn och en giltig e-postadress.",
  tid: "Kontrollera datum och tider.",
  gaster: "Ange antal gäster som ett tal.",
  for_manga: "Vi har fått många förfrågningar just nu. Prova igen om en stund eller ring oss.",
};

async function send(fd: FormData) {
  "use server";
  const embed = fd.get("embed") === "1" ? "&inbaddad=1" : "";
  const date = String(fd.get("date") ?? "");
  const from = String(fd.get("from") ?? "") || "09:00";
  const to = String(fd.get("to") ?? "") || "17:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) redirect(`/forfragan?fel=tid${embed}`);
  const starts = localToIso(`${date}T${from}`);
  const ends = localToIso(`${to <= from ? addDays(date, 1) : date}T${to}`);
  const p = {
    name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"), company: fd.get("company"), title: fd.get("title"),
    event_type_id: fd.get("event_type_id"), setup_id: fd.get("setup_id"), guests: fd.get("guests"), days: fd.get("days"),
    message: fd.get("message"), website: fd.get("website"), starts_at: starts, ends_at: ends,
  };
  const supabase = await createClient();
  const { data } = await supabase.rpc("submit_inquiry", { p });
  if (data !== "ok") redirect(`/forfragan?fel=${String(data ?? "x")}${embed}`);
  deliverNotifications();
  await kickMail();
  redirect(`/forfragan?tack=1${embed}`);
}

export default async function InquiryPage({ searchParams }: { searchParams: Promise<{ tack?: string; fel?: string; inbaddad?: string }> }) {
  const sp = await searchParams;
  const embed = sp.inbaddad === "1";
  const supabase = await createClient();
  const [{ data }, company] = await Promise.all([supabase.rpc("inquiry_options"), loadCompany(supabase)]);
  const opts = (data ?? { types: [], setups: [] }) as { types: Opt[]; setups: Opt[] };
  const min = addDays(todayDate(), 1);

  return (
    <div className={`min-h-dvh ${embed ? "bg-transparent" : "bg-bg"}`}>
      {!embed && (
        <header className="bg-brand text-white">
          <div className="mx-auto max-w-2xl px-4 py-6 grid gap-1">
            <p className="font-display font-semibold tracking-[0.18em] uppercase text-xs">{company.name}</p>
            <h1 className="font-display text-3xl font-semibold">Skicka en förfrågan</h1>
            <p className="opacity-90">Berätta vad ni planerar, så återkommer vi med förslag på lokal och pris.</p>
          </div>
        </header>
      )}
      <main className={`mx-auto max-w-2xl px-4 grid gap-4 ${embed ? "py-2" : "py-6"}`}>
        {sp.tack ? (
          <div className="card p-6 grid gap-2 text-center">
            <h2 className="font-display text-2xl font-semibold">Tack!</h2>
            <p>Vi har tagit emot er förfrågan och återkommer så snart vi kan, oftast inom en arbetsdag. En bekräftelse har skickats till er e-post.</p>
          </div>
        ) : (
          <form action={send} className="card p-5 grid gap-4">
            {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{ERR[sp.fel] ?? "Det gick inte att skicka. Prova igen eller kontakta oss."}</p>}
            <input type="hidden" name="embed" value={embed ? "1" : "0"} />
            {/* Fälla för robotar: ska lämnas tom. */}
            <div className="hidden" aria-hidden><label>Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="font-display text-lg font-semibold mb-2">Evenemanget</legend>
              <div className="field sm:col-span-2"><label className="label" htmlFor="title">Namn på evenemanget (valfritt)</label><input className="input" id="title" name="title" maxLength={200} /></div>
              <div className="field"><label className="label" htmlFor="event_type_id">Typ</label>
                <select className="input" id="event_type_id" name="event_type_id" defaultValue=""><option value="">Välj</option>{opts.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div className="field"><label className="label" htmlFor="guests">Antal gäster</label><input className="input" id="guests" name="guests" type="number" min={1} max={10000} inputMode="numeric" required /></div>
              <div className="field"><label className="label" htmlFor="date">Datum</label><input className="input" id="date" name="date" type="date" min={min} required /></div>
              <div className="field"><label className="label" htmlFor="days">Antal dagar</label><input className="input" id="days" name="days" type="number" min={1} max={14} defaultValue={1} /></div>
              <div className="field"><label className="label" htmlFor="from">Från</label><input className="input" id="from" name="from" type="time" step={900} defaultValue="09:00" /></div>
              <div className="field"><label className="label" htmlFor="to">Till</label><input className="input" id="to" name="to" type="time" step={900} defaultValue="17:00" /></div>
              <div className="field sm:col-span-2"><label className="label" htmlFor="setup_id">Möblering</label>
                <select className="input" id="setup_id" name="setup_id" defaultValue=""><option value="">Vet inte än</option>{opts.setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="field sm:col-span-2"><label className="label" htmlFor="message">Berätta mer (valfritt)</label>
                <textarea className="input min-h-24" id="message" name="message" maxLength={3000} placeholder="Program, mat, teknik, önskemål …" /></div>
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="font-display text-lg font-semibold mb-2">Kontaktuppgifter</legend>
              <div className="field"><label className="label" htmlFor="name">Namn</label><input className="input" id="name" name="name" required maxLength={120} autoComplete="name" /></div>
              <div className="field"><label className="label" htmlFor="company">Företag eller organisation</label><input className="input" id="company" name="company" maxLength={200} autoComplete="organization" /></div>
              <div className="field"><label className="label" htmlFor="email">E-post</label><input className="input" id="email" name="email" type="email" required maxLength={200} autoComplete="email" /></div>
              <div className="field"><label className="label" htmlFor="phone">Telefon</label><input className="input" id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" /></div>
            </fieldset>
            <p className="text-xs text-muted">Vi använder uppgifterna för att svara på förfrågan och spara den som kundkontakt.</p>
            <div><button className="btn btn-primary" type="submit">Skicka förfrågan</button></div>
          </form>
        )}
      </main>
    </div>
  );
}

import { canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { saveMailSettings, sendTestMail, setMailStatus } from "../actions";

export const metadata = { title: "E-post" };

type Mail = { id: string; to_email: string; to_name: string | null; subject: string; body: string; link: string | null; status: string; created_at: string; sent_at: string | null; error: string | null; attachment_name: string | null };

export default async function MailPage({ searchParams }: { searchParams: Promise<{ visa?: string; sparad?: string; test?: string; fel?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const manager = canManageStaff(profile);
  const admin = isAdmin(profile);
  const supabase = await createClient();
  const all = sp.visa === "alla";
  let q = supabase.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(200);
  if (!all) q = q.eq("status", "koad");
  const { data } = await q;
  const mails = (data ?? []) as Mail[];
  const [{ data: st }, { count: sentCount }, { count: failCount }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["mail_from", "mail_reply_to", "invoice_email_to", "payroll_email"]),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "skickad").not("sent_at", "is", null),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "fel"),
  ]);
  const cfg = new Map(((st ?? []) as { key: string; value: string }[]).map((x) => [x.key, x.value]));

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">E-post</h1>
        <p className="text-sm text-muted max-w-3xl">
          Inbjudningar, leverantörsbokningar och tidsunderlag läggs i den här kön och skickas automatiskt (inom en minut) när e-posttjänsten Resend är
          kopplad. Tills dess kan du skicka dem från ditt eget e-postprogram med en knapptryckning.
        </p>
      </div>
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {sp.test && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Testmejlet ligger i kön. Har det inte kommit inom en minut är e-posten inte kopplad än.</p>}
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {(failCount ?? 0) > 0 && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{failCount} mejl gick inte att skicka. Se felet under Alla.</p>}

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-semibold">Avsändare</h2>
        <p className="text-sm text-muted">{(sentCount ?? 0) > 0 ? `E-posten fungerar: ${sentCount} mejl skickade.` : "Inga mejl har skickats automatiskt ännu."}</p>
        <form action={saveMailSettings} className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div className="field">
            <label className="label" htmlFor="mail_from">Från</label>
            <input className="input" id="mail_from" name="mail_from" defaultValue={cfg.get("mail_from") ?? ""} disabled={!admin} placeholder="FCC Bokning <bokning@mail.filadelfiacc.se>" />
          </div>
          <div className="field">
            <label className="label" htmlFor="mail_reply_to">Svar till</label>
            <input className="input" id="mail_reply_to" name="mail_reply_to" type="email" defaultValue={cfg.get("mail_reply_to") ?? ""} disabled={!admin} placeholder="bokning@filadelfiacc.se" />
          </div>
          <div className="field">
            <label className="label" htmlFor="invoice_email_to">Fakturaunderlag skickas till</label>
            <input className="input" id="invoice_email_to" name="invoice_email_to" type="email" defaultValue={cfg.get("invoice_email_to") ?? ""} disabled={!admin} placeholder="ekonomi@…" />
          </div>
          <div className="field">
            <label className="label" htmlFor="payroll_email">Tidsunderlag (lön) skickas till</label>
            <input className="input" id="payroll_email" name="payroll_email" type="email" defaultValue={cfg.get("payroll_email") ?? ""} disabled={!admin} placeholder="lon@…" />
          </div>
          {admin && <div><button className="btn" type="submit">Spara</button></div>}
        </form>
        <form action={sendTestMail}>
          <button className="btn btn-ghost" type="submit">Skicka testmejl till mig</button>
        </form>
      </section>
      <nav className="flex gap-1">
        <a className={`btn ${all ? "" : "btn-primary"}`} href="/installningar/epost">Väntar ({all ? "…" : mails.length})</a>
        <a className={`btn ${all ? "btn-primary" : ""}`} href="/installningar/epost?visa=alla">Alla</a>
      </nav>
      {mails.length === 0 ? (
        <div className="card p-8 text-center text-muted">Inga mejl {all ? "ännu" : "väntar"}.</div>
      ) : (
        <ul className="grid gap-3">
          {mails.map((m) => {
            const body = m.link ? `${m.body}\n\n${m.link}` : m.body;
            return (
              <li key={m.id} className="card p-4 grid gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">{m.subject}</span>
                  <span className="text-sm text-muted">till {m.to_name ? `${m.to_name} <${m.to_email}>` : m.to_email}</span>
                  <span className="ml-auto text-xs text-muted">{fmtDate(m.created_at)} {fmtTime(m.created_at)} · {m.status === "koad" ? "väntar" : m.status}</span>
                </div>
                {m.attachment_name && <p className="text-xs text-muted">Bilaga: {m.attachment_name}</p>}
                {m.error && <p className="text-xs text-warn">Fel: {m.error}</p>}
                <details>
                  <summary className="cursor-pointer text-sm text-muted">Visa texten</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{body}</pre>
                </details>
                {manager && m.status === "koad" && (
                  <div className="flex flex-wrap gap-2">
                    <a className="btn btn-primary text-sm" href={`mailto:${m.to_email}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(body)}`}>Öppna i e-post</a>
                    <form action={setMailStatus.bind(null, m.id, "skickad")}><button className="btn text-sm" type="submit">Markera som skickat</button></form>
                    <form action={setMailStatus.bind(null, m.id, "struken")}><button className="btn btn-ghost text-sm" type="submit">Stryk</button></form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

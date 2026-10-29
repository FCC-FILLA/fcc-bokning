import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { setMailStatus } from "../actions";

export const metadata = { title: "E-post" };

type Mail = { id: string; to_email: string; to_name: string | null; subject: string; body: string; link: string | null; status: string; created_at: string; sent_at: string | null };

export default async function MailPage({ searchParams }: { searchParams: Promise<{ visa?: string }> }) {
  const sp = await searchParams;
  const manager = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const all = sp.visa === "alla";
  let q = supabase.from("email_outbox").select("*").order("created_at", { ascending: false }).limit(200);
  if (!all) q = q.eq("status", "koad");
  const { data } = await q;
  const mails = (data ?? []) as Mail[];

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">E-post</h1>
        <p className="text-sm text-muted max-w-3xl">
          Inbjudningar till frilansare och bokningar till leverantörer läggs i den här kön. E-post är inte kopplat ännu, så tills vidare skickar du dem
          från ditt eget e-postprogram med en knapptryckning. När e-posttjänsten är kopplad skickas kön automatiskt.
        </p>
      </div>
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

import { requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { PushToggle } from "@/components/push-toggle";
import { removePush, savePush } from "@/app/portal/actions";
import { markAllRead, openNotification, saveNotifyPrefs } from "./actions";

export const metadata = { title: "Notiser" };

const KINDS: { id: string; label: string; help: string }[] = [
  { id: "offert", label: "Offerter", help: "när en kund accepterar eller avböjer" },
  { id: "pass", label: "Pass", help: "när någon söker, tackar ja, tackar nej eller lämnar ett pass" },
  { id: "checklista", label: "Checklistor", help: "när en kund bockar av en punkt på eventsidan" },
  { id: "tid", label: "Tidrapporter", help: "när personal rapporterar sin tid" },
  { id: "uppgift", label: "Uppgifter", help: "när du får en uppgift och dagen innan den ska vara klar" },
  { id: "fel", label: "Felanmälningar", help: "när någon felanmäler i en lokal via QR-skylten" },
  { id: "option", label: "Optioner", help: "när kunden påminns, svarar eller släpper en option, och när en option gått ut" },
];

type Row = { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ sparad?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data }, { data: prefs }] = await Promise.all([
    supabase.from("notifications").select("id, kind, title, body, link, created_at, read_at").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("notify_kinds, notify_scope, notify_email").eq("id", profile.id).single(),
  ]);
  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => !r.read_at).length;
  const p = (prefs ?? { notify_kinds: ["offert", "pass", "checklista"], notify_scope: "mina", notify_email: false }) as { notify_kinds: string[]; notify_scope: string; notify_email: boolean };

  return (
    <div className="grid gap-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Notiser</h1>
        {unread > 0 && <span className="text-sm text-muted">{unread} olästa</span>}
        <span className="flex-1" />
        {unread > 0 && (
          <form action={markAllRead}><button className="btn btn-ghost text-sm" type="submit">Markera alla som lästa</button></form>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">Inga notiser ännu. Här hamnar svar från kunder och personal.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <form action={openNotification.bind(null, r.id, r.link)}>
                <button type="submit" className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sunk/60 ${r.read_at ? "" : "bg-brand-soft/60"}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${r.read_at ? "bg-transparent" : "bg-brand"}`} aria-hidden />
                  <span className="grid flex-1 gap-0.5">
                    <span className={r.read_at ? "" : "font-semibold"}>{r.title}</span>
                    {r.body && <span className="text-sm text-muted">{r.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{fmtDate(r.created_at)} {fmtTime(r.created_at)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section id="installningar" className="card p-5 grid gap-4 scroll-mt-28">
        <h2 className="text-lg font-semibold">Vad du vill få notiser om</h2>
        {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-2 text-sm text-ok">Sparat.</p>}
        <form action={saveNotifyPrefs} className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="label mb-1">Slags notiser</legend>
            {KINDS.map((k) => (
              <label key={k.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="kinds" value={k.id} defaultChecked={p.notify_kinds.includes(k.id)} className="mt-0.5" />
                <span><span className="font-medium">{k.label}</span> <span className="text-muted">{k.help}</span></span>
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="label mb-1">För vilka evenemang</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="scope" value="mina" defaultChecked={p.notify_scope !== "alla"} className="mt-0.5" />
              <span>Bara mina: där jag är ansvarig, säljare på offerten eller har skapat passet. Saknas ansvarig får alla notisen.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="scope" value="alla" defaultChecked={p.notify_scope === "alla"} className="mt-0.5" />
              <span>Alla evenemang</span>
            </label>
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="email" defaultChecked={p.notify_email} className="mt-0.5" />
            <span>Skicka också som e-post till {profile.email}</span>
          </label>
          <div><button className="btn btn-primary" type="submit">Spara</button></div>
        </form>
        <div className="grid gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">Notiser i telefonen eller datorn</h3>
          <p className="text-sm text-muted">Slå på på varje enhet där du vill få notiser. På iPhone måste appen först läggas till på hemskärmen (Dela → Lägg till på hemskärmen).</p>
          <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} save={savePush} remove={removePush} />
        </div>
      </section>
    </div>
  );
}

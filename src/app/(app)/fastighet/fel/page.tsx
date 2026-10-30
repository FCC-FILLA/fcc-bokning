import Link from "next/link";
import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { createIssue, updateIssue } from "./actions";

export const metadata = { title: "Felanmälningar" };

type Issue = {
  id: string; room_id: string; title: string; description: string | null; photo_path: string | null; reporter_name: string | null;
  reporter_contact: string | null; status: "ny" | "pagaende" | "klar"; assignee_id: string | null; resolution: string | null;
  created_at: string; resolved_at: string | null; rooms: { name: string; blocked: boolean } | null;
};
const LABEL = { ny: "Ny", pagaende: "Åtgärdas", klar: "Klar" } as const;
const TONE = { ny: "bg-warn-soft text-warn", pagaende: "bg-st-preliminar-soft text-st-preliminar", klar: "bg-st-genomford-soft text-ok" } as const;

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ visa?: string; lokal?: string; fel?: string }> }) {
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  let q = supabase.from("room_issues").select("*, rooms(name, blocked)").order("created_at", { ascending: false }).limit(200);
  if (sp.visa !== "alla") q = q.neq("status", "klar");
  if (sp.lokal && /^[0-9a-f-]{36}$/i.test(sp.lokal)) q = q.eq("room_id", sp.lokal);
  const [{ data }, { data: people }, { data: rooms }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name, email").eq("active", true).in("role", ["admin", "bokare", "produktion"]).order("full_name"),
    supabase.from("rooms").select("id, name").eq("active", true).order("sort_order"),
  ]);
  const issues = (data ?? []) as unknown as Issue[];
  // Signerade länkar till foton (privat hink), giltiga en timme.
  const paths = issues.map((x) => x.photo_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("felanmalan").createSignedUrls(paths, 3600) : { data: [] };
  const photo = new Map<string, string>((signed ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string]));
  const staff = (people ?? []) as { id: string; full_name: string | null; email: string }[];
  const back = [sp.visa && `visa=${sp.visa}`, sp.lokal && `lokal=${sp.lokal}`].filter(Boolean).join("&");

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid gap-1 grow">
          <h1 className="text-2xl font-semibold">Felanmälningar</h1>
          <p className="text-sm text-muted">Fel som anmälts via QR-skyltarna i lokalerna. Spärra en lokal under Lokaler → lokalen → Lokalkort.</p>
        </div>
        <Link className="btn btn-ghost" href={sp.visa === "alla" ? "/fastighet/fel" : "/fastighet/fel?visa=alla"}>{sp.visa === "alla" ? "Bara öppna" : "Visa även klara"}</Link>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {issues.length === 0 && <div className="card p-8 text-center text-muted">Inga öppna fel.</div>}
      <ul className="grid gap-3">
        {issues.map((x) => (
          <li key={x.id} id={x.id} className="card p-4 grid gap-3 scroll-mt-24 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[x.status]}`}>{LABEL[x.status]}</span>
                <Link className="text-sm font-semibold hover:underline" href={`/lokaler/${x.room_id}#lokalkort`}>{x.rooms?.name}</Link>
                {x.rooms?.blocked && <span className="text-xs text-warn">spärrad</span>}
                <span className="text-xs text-muted">{fmtDate(x.created_at)} {fmtTime(x.created_at)}{x.reporter_name ? ` · ${x.reporter_name}` : ""}{x.reporter_contact ? ` (${x.reporter_contact})` : ""}</span>
              </div>
              <p className="font-semibold">{x.title}</p>
              {x.description && <p className="text-sm whitespace-pre-line">{x.description}</p>}
              {editor ? (
                <form action={updateIssue.bind(null, x.id)} className="mt-1 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="back" value={back} />
                  <select className="input h-8 w-auto py-0 text-sm" name="status" defaultValue={x.status} aria-label="Status">
                    {(["ny", "pagaende", "klar"] as const).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                  </select>
                  <select className="input h-8 w-44 py-0 text-sm" name="assignee_id" defaultValue={x.assignee_id ?? ""} aria-label="Ansvarig">
                    <option value="">Ingen ansvarig</option>
                    {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                  </select>
                  <input className="input h-8 grow min-w-40 py-0 text-sm" name="resolution" defaultValue={x.resolution ?? ""} placeholder="Vad som gjordes" aria-label="Åtgärd" />
                  <button className="btn text-sm" type="submit">Spara</button>
                </form>
              ) : x.resolution ? <p className="text-sm text-muted">Åtgärd: {x.resolution}</p> : null}
            </div>
            {x.photo_path && photo.get(x.photo_path) && (
              <a href={photo.get(x.photo_path)} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- signerad, tillfällig adress */}
                <img src={photo.get(x.photo_path)} alt={`Foto: ${x.title}`} className="h-32 w-44 rounded-lg object-cover" />
              </a>
            )}
          </li>
        ))}
      </ul>
      {editor && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Lägg in ett fel</summary>
          <form action={createIssue} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="field w-48"><label className="label" htmlFor="i-room">Lokal</label>
              <select className="input" id="i-room" name="room_id" required defaultValue={sp.lokal ?? ""}>
                <option value="" disabled>Välj</option>
                {((rooms ?? []) as { id: string; name: string }[]).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></div>
            <div className="field grow"><label className="label" htmlFor="i-title">Vad är fel</label><input className="input" id="i-title" name="title" required /></div>
            <div className="field grow"><label className="label" htmlFor="i-desc">Detaljer</label><input className="input" id="i-desc" name="description" /></div>
            <button className="btn btn-primary" type="submit">Lägg till</button>
          </form>
        </details>
      )}
    </div>
  );
}

import { isAdmin, requireProfile } from "@/lib/auth";
import { checkRoot, driveConfigured, folderUrl, serviceAccountEmail } from "@/lib/drive";
import { createClient } from "@/lib/supabase/server";
import { saveDriveRoot } from "./actions";

export const metadata = { title: "Google Drive" };

export default async function DrivePage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "drive_root_folder").maybeSingle();
  const root = data?.value ?? "";
  const configured = driveConfigured();
  const email = serviceAccountEmail();
  let status: { ok: boolean; text: string } | null = null;
  if (configured && root) {
    try {
      status = { ok: true, text: `Ansluten till mappen ”${await checkRoot(root)}”.` };
    } catch (e) {
      status = { ok: false, text: e instanceof Error ? e.message : "Mappen gick inte att nå." };
    }
  }

  return (
    <div className="grid gap-5 max-w-3xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Google Drive</h1>
        <p className="text-sm text-muted">
          Varje evenemang får en projektmapp: <b>Huvudmapp / Kund / År / ÅÅÅÅ-MM-DD Evenemang</b>. Mappen skapas automatiskt när evenemanget bekräftas,
          eller med knappen Skapa projektmapp under Genomförande → Dokument.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-semibold">Koppling</h2>
        <ul className="grid gap-1 text-sm">
          <li>{configured ? "✓" : "✗"} Servicekontots nyckel {configured ? "finns i Vercel" : "saknas – lägg in GOOGLE_SERVICE_ACCOUNT_JSON i Vercel och gör en ny deploy"}.</li>
          {email && <li>Dela huvudmappen med <code className="rounded bg-sunk px-1">{email}</code> som Redigerare.</li>}
          {status && <li className={status.ok ? "text-ok" : "text-warn"}>{status.ok ? "✓" : "✗"} {status.text}</li>}
        </ul>
        <form action={saveDriveRoot} className="flex flex-wrap items-end gap-2">
          <div className="field grow min-w-72">
            <label className="label" htmlFor="root">Huvudmapp (länk eller mapp-id)</label>
            <input className="input" id="root" name="root" defaultValue={root ? folderUrl(root) : ""} disabled={!admin} placeholder="https://drive.google.com/drive/folders/…" />
          </div>
          {admin && <button className="btn btn-primary" type="submit">Spara</button>}
        </form>
      </section>
    </div>
  );
}

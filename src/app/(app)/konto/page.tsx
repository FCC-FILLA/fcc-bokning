import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";
import { CopyButton } from "@/components/copy-button";

export const metadata = { title: "Mitt konto" };

async function createLink(fd: FormData) {
  "use server";
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase.from("calendar_tokens").delete().eq("user_id", me.id);
  await supabase.from("calendar_tokens").insert({ user_id: me.id, include_unconfirmed: fd.get("include_unconfirmed") === "on" });
  revalidatePath("/konto");
  redirect("/konto?ny=1#kalender");
}

async function updateLink(fd: FormData) {
  "use server";
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase.from("calendar_tokens").update({ include_unconfirmed: fd.get("include_unconfirmed") === "on" }).eq("user_id", me.id);
  revalidatePath("/konto");
  redirect("/konto?sparad=1#kalender");
}

async function removeLink() {
  "use server";
  const me = await requireProfile();
  const supabase = await createClient();
  await supabase.from("calendar_tokens").delete().eq("user_id", me.id);
  revalidatePath("/konto");
  redirect("/konto#kalender");
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ny?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: tok } = await supabase.from("calendar_tokens").select("*").eq("user_id", me.id).maybeSingle();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const httpsUrl = tok ? `https://${host}/kalender/${tok.token}.ics` : null;
  const webcalUrl = httpsUrl?.replace(/^https:/, "webcal:");

  return (
    <div className="grid gap-5 max-w-3xl">
      <h1 className="text-2xl font-semibold">Mitt konto</h1>

      <section className="card p-5 grid gap-1">
        <p className="font-semibold">{me.full_name || "Namn saknas"}</p>
        <p className="text-sm text-muted">{me.email} · {ROLE_LABEL[me.role]}</p>
        <p className="text-sm mt-2"><Link className="underline" href="/konto/losenord">Byt lösenord</Link></p>
      </section>

      <section id="kalender" className="card p-5 grid gap-3 scroll-mt-20">
        <h2 className="text-lg font-semibold">Bokningarna i din egen kalender</h2>
        <p className="text-sm text-muted">
          Prenumerera på FCC:s bokningar i Outlook, Google Kalender eller på telefonen. Kalendern uppdateras av sig själv
          (Outlook och Google hämtar oftast ändringar några gånger per dag). Länken är personlig: dela den inte. Visar en
          månad bakåt och ett år framåt.
        </p>

        {!tok ? (
          <form action={createLink} className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="include_unconfirmed" defaultChecked /> Ta med förfrågningar och preliminära bokningar
            </label>
            <div><button className="btn btn-primary" type="submit">Skapa min kalenderlänk</button></div>
          </form>
        ) : (
          <div className="grid gap-3">
            {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Länken är skapad. Gamla länkar slutar fungera.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-sunk px-2 py-1.5 text-sm break-all">{httpsUrl}</code>
              <CopyButton text={httpsUrl!} />
            </div>
            <ul className="text-sm grid gap-1 list-disc pl-5">
              <li><strong>iPhone/Mac:</strong> <a className="underline" href={webcalUrl!}>Öppna i Kalender</a></li>
              <li><strong>Outlook:</strong> Lägg till kalender → Prenumerera från webben → klistra in länken.</li>
              <li><strong>Google Kalender:</strong> Andra kalendrar → + → Från webbadress → klistra in länken.</li>
            </ul>
            <form action={updateLink} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="include_unconfirmed" defaultChecked={tok.include_unconfirmed} /> Ta med förfrågningar och preliminära bokningar
              </label>
              <button className="btn" type="submit">Spara</button>
              {sp.sparad && <span className="text-ok">Sparat</span>}
            </form>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <form action={createLink}>
                <input type="hidden" name="include_unconfirmed" value={tok.include_unconfirmed ? "on" : ""} />
                <button className="btn" type="submit">Skapa ny länk (den gamla slutar fungera)</button>
              </form>
              <form action={removeLink}><button className="btn btn-ghost text-warn" type="submit">Ta bort länken</button></form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

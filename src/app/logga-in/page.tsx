import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LinkSession } from "@/components/link-session";

export const metadata = { title: "Logga in" };

async function signIn(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect("/logga-in?fel=1");
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const { fel } = await searchParams;
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm grid gap-6">
        <div className="grid gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fcc-logo-black.svg" alt="Filadelfia Convention Center" width={240} height={61} className="h-auto w-60" />
          <h1 className="text-3xl font-semibold text-brand">Venue Management</h1>
        </div>
        <LinkSession />
        <form action={signIn} className="card p-6 grid gap-4">
          <div className="field">
            <label className="label" htmlFor="email">E-post</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Lösenord</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {fel && (
            <p className="text-sm text-warn">
              {fel === "lank"
                ? "Länken är ogiltig eller har gått ut. Be en administratör skicka en ny."
                : "Fel e-post eller lösenord. Försök igen."}
            </p>
          )}
          <button className="btn btn-primary" type="submit">Logga in</button>
        </form>
        <p className="text-sm text-muted">
          Konton skapas av en administratör. Har du glömt lösenordet, be en administratör skicka en ny länk.
        </p>
      </div>
    </main>
  );
}

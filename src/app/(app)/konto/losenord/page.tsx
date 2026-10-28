import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Välj lösenord" };

async function setPassword(fd: FormData) {
  "use server";
  const password = String(fd.get("password") ?? "");
  const repeat = String(fd.get("repeat") ?? "");
  if (password.length < 10) redirect("/konto/losenord?fel=kort");
  if (password !== repeat) redirect("/konto/losenord?fel=olika");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/konto/losenord?fel=1");
  redirect("/?valkommen=1");
}

const MESSAGES: Record<string, string> = {
  kort: "Lösenordet måste vara minst 10 tecken.",
  olika: "Lösenorden matchar inte.",
  "1": "Det gick inte att spara lösenordet. Försök igen.",
};

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const { fel } = await searchParams;
  return (
    <form action={setPassword} className="card p-6 grid gap-4 max-w-sm">
      <h1 className="text-xl font-semibold">Välj lösenord</h1>
      <p className="text-sm text-muted">Du använder det tillsammans med din e-post när du loggar in.</p>
      <div className="field">
        <label className="label" htmlFor="password">Nytt lösenord</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="repeat">Upprepa lösenordet</label>
        <input className="input" id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {fel && <p className="text-sm text-warn">{MESSAGES[fel] ?? MESSAGES["1"]}</p>}
      <div><button className="btn btn-primary" type="submit">Spara lösenord</button></div>
    </form>
  );
}

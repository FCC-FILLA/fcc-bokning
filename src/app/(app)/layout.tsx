import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";
import { Nav } from "@/components/nav";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/logga-in");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: conflicts } = await supabase
    .from("booking_conflicts")
    .select("booking_id, other_booking_id")
    .gte("ends_at", new Date().toISOString());
  // Varje krock syns två gånger (A–B och B–A).
  const conflictCount = Math.round((conflicts?.length ?? 0) / 2);

  return (
    <div className="min-h-dvh">
      <header className="bg-brand text-white sticky top-0 z-20 print:hidden">
        <div className="mx-auto max-w-[1500px] px-4 pt-3 pb-2 grid gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="font-display font-semibold text-lg tracking-wide">
              FCC <span className="font-normal opacity-75">Bokning</span>
            </Link>
            <form action="/sok" method="get" className="flex-1 min-w-48 max-w-md" role="search">
              <input
                name="q"
                type="search"
                placeholder="Sök evenemang, kunder, offerter…"
                aria-label="Sök"
                className="w-full rounded-full bg-white/12 px-4 py-1.5 text-sm text-white placeholder:text-white/60 outline-none focus:bg-white/20 focus:ring-2 focus:ring-white/40"
              />
            </form>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Link href="/konto" className="opacity-85 hover:opacity-100 hover:underline underline-offset-2">
                {profile.full_name || profile.email} · {ROLE_LABEL[profile.role]}
              </Link>
              <form action={signOut}>
                <button className="underline-offset-2 hover:underline opacity-90" type="submit">Logga ut</button>
              </form>
            </div>
          </div>
          <Nav conflictCount={conflictCount} admin={isAdmin(profile)} />
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 grid gap-5 print:p-0">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAdmin, isStaffOnly, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";
import { Nav, SubNav } from "@/components/nav";
import { deliverNotifications } from "@/lib/notiser";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/logga-in");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  // Internpersonal ser bara sin portal (och kan byta lösenord).
  if (isStaffOnly(profile)) {
    if (!((await headers()).get("x-pathname") ?? "").startsWith("/konto")) redirect("/portal");
    return (
      <div className="min-h-dvh">
        <header className="bg-brand text-white print:hidden">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-4">
            <Link href="/portal" className="font-display font-semibold">← Mina pass</Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6 grid gap-5">{children}</main>
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: conflicts }, { count: unread }, { data: testRow }] = await Promise.all([
    supabase.from("booking_conflicts").select("booking_id, other_booking_id").gte("ends_at", new Date().toISOString()),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).is("read_at", null),
    supabase.from("app_settings").select("value").eq("key", "mail_test_to").maybeSingle(),
  ]);
  const mailTestTo = ((testRow as { value: string } | null)?.value ?? "").trim();
  deliverNotifications();
  // Varje krock syns två gånger (A–B och B–A).
  const conflictCount = Math.round((conflicts?.length ?? 0) / 2);

  return (
    <div className="min-h-dvh">
      {mailTestTo && (
        <div className="bg-warn-soft text-warn text-center text-xs font-semibold px-4 py-1.5 print:hidden">
          Testläge: inga mejl går till kunder eller personal – allt skickas till {mailTestTo}.{" "}
          <Link href="/installningar/epost" className="underline">Ändra</Link>
        </div>
      )}
      <header className="bg-brand text-white sticky top-0 z-20 print:hidden">
        <div className="mx-auto max-w-[1500px] px-4 pt-3 pb-2 grid gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/" className="flex items-center gap-3" aria-label="FCC Bokning, till översikten">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/fcc-logo-white.svg" alt="Filadelfia Convention Center" width={127} height={32} className="h-8 w-auto" />
              <span className="border-l border-white/30 pl-3 font-display text-lg tracking-wide opacity-85">Bokning</span>
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
              <Link
                href="/notiser"
                className="relative grid size-8 place-items-center rounded-full hover:bg-white/15"
                aria-label={unread ? `Notiser, ${unread} olästa` : "Notiser"}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {!!unread && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold leading-4 text-brand">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/konto" className="opacity-85 hover:opacity-100 hover:underline underline-offset-2">
                {profile.full_name || profile.email} · {ROLE_LABEL[profile.role]}
              </Link>
              <form action={signOut}>
                <button className="underline-offset-2 hover:underline opacity-90" type="submit">Logga ut</button>
              </form>
            </div>
          </div>
          <Nav conflictCount={conflictCount} />
        </div>
        <SubNav conflictCount={conflictCount} admin={isAdmin(profile)} />
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 grid gap-5 print:p-0">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCompany } from "@/lib/foretag";
import { ROLE_LABEL } from "@/lib/types";
import { ArticleIcon } from "@/components/icon";

export const metadata = { title: "Inställningar" };

type Card = { href: string; title: string; text: string; icon: string; facts: string[]; adminOnly?: boolean };

export default async function SettingsPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile);
  const supabase = await createClient();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const company = await loadCompany(supabase);
  const [rooms, articles, noPrice, withText, users, inactiveUsers, calendar] = await Promise.all([
    count(supabase.from("rooms").select("id", { count: "exact", head: true }).eq("active", true)),
    count(supabase.from("articles").select("id", { count: "exact", head: true }).eq("active", true)),
    count(supabase.from("articles").select("id", { count: "exact", head: true }).eq("active", true).is("price", null)),
    count(supabase.from("articles").select("id", { count: "exact", head: true }).eq("active", true).not("description", "is", null)),
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", true)),
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("active", false)),
    count(supabase.from("calendar_tokens").select("user_id", { count: "exact", head: true }).eq("user_id", profile.id)),
  ]);

  const cards: Card[] = [
    {
      href: "/lokaler",
      title: "Lokaler",
      text: "Salar och delytor, kapacitet per möblering och vilka lokaler som krockar med varandra.",
      icon: "room",
      facts: [`${rooms} aktiva lokaler`],
    },
    {
      href: "/prislista",
      title: "Prislista",
      text: "Artiklar med pris, kostnad och moms, samt bild, ikon och text som kunden ser i offerten.",
      icon: "discount",
      facts: [`${articles} artiklar`, noPrice ? `${noPrice} saknar pris` : "alla har pris", `${withText} har kundtext`],
    },
    {
      href: "/installningar/offerttexter",
      title: "Offerttexter",
      text: "Inledning, villkor och giltighetstid som följer med varje ny offert.",
      icon: "host",
      facts: [],
    },
    {
      href: "/installningar/foretag",
      title: "Företagsuppgifter",
      text: "Namn, adress, organisationsnummer och kontaktuppgifter som visas i offerter och PDF:er.",
      icon: "document",
      facts: company.orgnr ? [company.legal_name] : ["organisationsnummer saknas"],
    },
    {
      href: "/anvandare",
      title: "Användare och roller",
      text: "Vem som har tillgång, vilken roll de har och vem som är avstängd.",
      icon: "person",
      facts: [`${users} aktiva`, ...(inactiveUsers ? [`${inactiveUsers} avstängda`] : [])],
      adminOnly: true,
    },
    {
      href: "/konto",
      title: "Mitt konto",
      text: "Namn, lösenord och din personliga kalenderprenumeration för Outlook, Google eller iPhone.",
      icon: "clock",
      facts: [`${ROLE_LABEL[profile.role]}`, calendar ? "kalender prenumererad" : "ingen kalenderlänk ännu"],
    },
  ];

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Inställningar</h1>
        <p className="text-sm text-muted">Grunddata som resten av systemet bygger på.{admin ? "" : " Det mesta här kan bara administratörer ändra."}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards
          .filter((c) => admin || !c.adminOnly)
          .map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="card p-5 h-full grid grid-cols-[auto_1fr] gap-4 items-start hover:border-muted transition-colors">
                <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
                  <ArticleIcon name={c.icon} className="size-7" />
                </span>
                <span className="grid gap-1">
                  <span className="font-semibold">{c.title}</span>
                  <span className="text-sm text-muted">{c.text}</span>
                  {c.facts.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {c.facts.map((f) => <span key={f} className="rounded-full bg-sunk px-2 py-0.5 text-xs">{f}</span>)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

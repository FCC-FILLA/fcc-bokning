import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canBook, canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { loadInternalDoc } from "@/lib/offert-doc";
import { createClient } from "@/lib/supabase/server";
import { QuoteView } from "@/components/quote-view";

export const metadata: Metadata = { title: "Förhandsvisning av offert", robots: { index: false } };

/** Visar en befintlig offert med nuvarande utseende, för att prova inställningarna under Inställningar → Offert. */
export default async function QuotePreview({ searchParams }: { searchParams: Promise<{ offert?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  if (!isAdmin(profile) && !canBook(profile) && !canManageStaff(profile)) redirect("/");
  const supabase = await createClient();
  let id = sp.offert && /^[0-9a-f-]{36}$/i.test(sp.offert) ? sp.offert : null;
  if (!id) {
    const { data } = await supabase.from("quotes").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    id = data?.id ?? null;
  }
  const doc = id ? await loadInternalDoc(supabase, id) : null;
  if (!doc) {
    return (
      <main className="mx-auto max-w-xl p-8 grid gap-3">
        <h1 className="text-xl font-semibold">Ingen offert att visa</h1>
        <p className="text-muted">Skapa en offert först, så kan du se hur den ser ut med dina inställningar.</p>
        <Link className="btn" href="/installningar/offert">Tillbaka</Link>
      </main>
    );
  }
  return <QuoteView doc={doc} pdfHref={`/offerter/${id}/pdf`} preview />;
}

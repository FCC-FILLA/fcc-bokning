import Link from "next/link";
import { canBook, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { CompanyFields } from "@/components/company-fields";
import { createCompany } from "./actions";

export const metadata = { title: "Kunder" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; fel?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const profile = await requireProfile();
  const supabase = await createClient();

  let query = supabase.from("companies").select("*, contacts(count), events(count)").order("name");
  if (q) query = query.ilike("name", `%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query.limit(500);
  const companies = (data ?? []) as (Company & { contacts: { count: number }[]; events: { count: number }[] })[];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Kunder</h1>
        <span className="flex-1" />
        <form method="get" className="flex gap-2">
          <input className="input w-56" name="q" defaultValue={q} placeholder="Sök kund" aria-label="Sök kund" />
          <button className="btn" type="submit">Sök</button>
        </form>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="card overflow-x-auto">
          {companies.length === 0 ? (
            <p className="p-8 text-center text-muted">{q ? "Inga kunder matchar sökningen." : "Inga kunder ännu. Lägg till den första i formuläret."}</p>
          ) : (
            <table className="table min-w-[560px]">
              <thead>
                <tr><th>Kund</th><th>Kontakt</th><th>Kontaktpersoner</th><th>Evenemang</th></tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-sunk/60">
                    <td>
                      <Link href={`/kunder/${c.id}`} className="font-semibold hover:underline underline-offset-2">{c.name}</Link>
                      {c.org_nr && <span className="block text-xs text-muted font-mono">{c.org_nr}</span>}
                    </td>
                    <td className="text-sm">{c.email ?? c.phone ?? <span className="text-muted">–</span>}</td>
                    <td>{c.contacts?.[0]?.count ?? 0}</td>
                    <td>{c.events?.[0]?.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canBook(profile) && (
          <form action={createCompany} className="card p-5 grid gap-4">
            <h2 className="text-lg font-semibold">Ny kund</h2>
            <CompanyFields />
            <div><button className="btn btn-primary" type="submit">Spara kund</button></div>
          </form>
        )}
      </div>
    </>
  );
}

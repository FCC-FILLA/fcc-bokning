import Link from "next/link";
import { canBook, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";
import { CompanyFields } from "@/components/company-fields";
import { createCompany } from "./actions";
import { SortTh, parseSort, sortRows } from "@/components/sort-th";

export const metadata = { title: "Kunder" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; fel?: string; kategori?: string; sort?: string; ordning?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const profile = await requireProfile();
  const supabase = await createClient();

  let query = supabase.from("companies").select("*, contacts(count), events(count)").order("name");
  if (q) {
    const term = q.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${term}%,org_nr.ilike.%${term}%,city.ilike.%${term}%,email.ilike.%${term}%`);
  }
  if (sp.kategori) query = query.contains("categories", [sp.kategori]);
  const [{ data }, { data: catRows }] = await Promise.all([query.limit(2000), supabase.from("companies").select("categories")]);
  type Row = Company & { contacts: { count: number }[]; events: { count: number }[] };
  const sort = parseSort(sp, ["namn", "ort", "kategori", "kontakter", "evenemang"], { col: "namn", asc: true });
  const companies = sortRows((data ?? []) as Row[], sort, {
    namn: (c) => c.name,
    ort: (c) => c.city,
    kategori: (c) => c.categories?.join(", "),
    kontakter: (c) => c.contacts?.[0]?.count ?? 0,
    evenemang: (c) => c.events?.[0]?.count ?? 0,
  });
  const counts = new Map<string, number>();
  for (const r of (catRows ?? []) as { categories: string[] }[]) for (const c of r.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  const categories = [...counts].sort((a, b) => b[1] - a[1]);
  const href = (extra: string) => `/kunder?${[q && `q=${encodeURIComponent(q)}`, sp.kategori && `kategori=${encodeURIComponent(sp.kategori)}`, extra].filter(Boolean).join("&")}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Kunder</h1>
        <span className="flex-1" />
        <form method="get" className="flex gap-2">
          {sp.kategori && <input type="hidden" name="kategori" value={sp.kategori} />}
          <input className="input w-56" name="q" defaultValue={q} placeholder="Namn, org.nr, ort, e-post" aria-label="Sök kund" />
          <button className="btn" type="submit">Sök</button>
        </form>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Link href={`/kunder${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full border px-2.5 py-1 font-medium ${!sp.kategori ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>Alla</Link>
        {categories.map(([c, n]) => (
          <Link key={c} href={`/kunder?kategori=${encodeURIComponent(c)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full border px-2.5 py-1 font-medium ${sp.kategori === c ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>
            {c} <span className="text-muted">{n}</span>
          </Link>
        ))}
        <span className="ml-auto text-muted">{companies.length} kunder</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="card overflow-x-auto">
          {companies.length === 0 ? (
            <p className="p-8 text-center text-muted">{q ? "Inga kunder matchar sökningen." : "Inga kunder ännu. Lägg till den första i formuläret."}</p>
          ) : (
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <SortTh col="namn" label="Kund" sort={sort} href={href} />
                  <SortTh col="ort" label="Ort" sort={sort} href={href} />
                  <SortTh col="kategori" label="Kategori" sort={sort} href={href} />
                  <th>Kontakt</th>
                  <SortTh col="kontakter" label="Kontakter" sort={sort} href={href} />
                  <SortTh col="evenemang" label="Evenemang" sort={sort} href={href} />
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-sunk/60">
                    <td>
                      <Link href={`/kunder/${c.id}`} className="font-semibold hover:underline underline-offset-2">{c.name}</Link>
                      {c.org_nr && <span className="block text-xs text-muted font-mono">{c.org_nr}</span>}
                    </td>
                    <td className="text-sm capitalize">{c.city?.toLowerCase() ?? <span className="text-muted">–</span>}</td>
                    <td className="text-xs">{c.categories?.length ? c.categories.join(", ") : <span className="text-muted">–</span>}</td>
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
            <CompanyFields categories={[...new Set([...categories.map(([c]) => c)])]} />
            <div><button className="btn btn-primary" type="submit">Spara kund</button></div>
          </form>
        )}
      </div>
    </>
  );
}

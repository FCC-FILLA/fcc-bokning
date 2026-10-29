import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { INVOICE_KIND_LABEL, INVOICE_STATUS_LABEL, type InvoiceKind } from "@/lib/faktura";
import { fmtKr } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { SortTh, parseSort, sortRows } from "@/components/sort-th";

export const metadata = { title: "Fakturaunderlag" };

type Row = { id: string; number: number; kind: InvoiceKind; percent: number | null; status: string; event_id: string; event_title: string; company_name: string | null; total_ex_vat: number; total_vat: number; created_at: string; sent_at: string | null };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; sort?: string; ordning?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const supabase = await createClient();
  let q = supabase.from("invoice_overview").select("id, number, kind, percent, status, event_id, event_title, company_name, total_ex_vat, total_vat, created_at, sent_at").order("number", { ascending: false }).limit(500);
  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  const sort = parseSort(sp, ["nr", "evenemang", "kund", "belopp", "status"], { col: "nr", asc: false });
  const rows = sortRows((data ?? []) as Row[], sort, {
    nr: (r) => r.number, evenemang: (r) => r.event_title, kund: (r) => r.company_name, belopp: (r) => Number(r.total_ex_vat), status: (r) => r.status,
  });
  const href = (extra: string) => `/fakturor?${[sp.status && `status=${sp.status}`, extra].filter(Boolean).join("&")}`;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Fakturaunderlag</h1>
        <span className="flex-1" />
        {["", "utkast", "skickad", "makulerad"].map((s) => (
          <Link key={s} className={`btn ${(sp.status ?? "") === s ? "btn-primary" : "btn-ghost"} text-sm`} href={s ? `/fakturor?status=${s}` : "/fakturor"}>{s ? INVOICE_STATUS_LABEL[s] : "Alla"}</Link>
        ))}
      </div>
      <p className="text-sm text-muted">Nya underlag skapas på evenemanget under Ekonomi.</p>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted">Inga underlag ännu.</p>
        ) : (
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <SortTh col="nr" label="Nr" sort={sort} href={href} />
                <SortTh col="evenemang" label="Evenemang" sort={sort} href={href} />
                <SortTh col="kund" label="Kund" sort={sort} href={href} />
                <th>Typ</th>
                <SortTh col="belopp" label="Exkl. moms" sort={sort} href={href} className="text-right" />
                <SortTh col="status" label="Status" sort={sort} href={href} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-sunk/60">
                  <td><Link className="font-semibold hover:underline" href={`/fakturor/${r.id}`}>{r.number}</Link></td>
                  <td><Link className="hover:underline" href={`/evenemang/${r.event_id}#fakturering`}>{r.event_title}</Link></td>
                  <td>{r.company_name ?? <span className="text-muted">–</span>}</td>
                  <td className="text-sm">{INVOICE_KIND_LABEL[r.kind]}{r.kind === "del" && r.percent != null ? ` ${Number(r.percent)} %` : ""}</td>
                  <td className="text-right tabular-nums">{fmtKr(Number(r.total_ex_vat))}</td>
                  <td className="text-sm">{INVOICE_STATUS_LABEL[r.status]}{r.sent_at ? ` ${fmtDate(r.sent_at)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { addDays, fmtDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Uppgifter" };

type Row = {
  id: string; title: string; note: string | null; due_date: string | null; days_before: number | null; done_at: string | null;
  assignee_id: string | null; customer_visible: boolean;
  events: { id: string; title: string; status: string; responsible_id: string | null } | null;
};

async function toggle(id: string, isDone: boolean) {
  "use server";
  const p = await requireProfile();
  const supabase = await createClient();
  await supabase.from("event_checklist").update({ done_at: isDone ? new Date().toISOString() : null, done_by: isDone ? p.full_name || p.email : null }).eq("id", id);
  revalidatePath("/uppgifter");
  redirect("/uppgifter");
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ visa?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile();
  const all = sp.visa === "alla";
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_checklist")
    .select("id, title, note, due_date, days_before, done_at, assignee_id, customer_visible, events!inner(id, title, status, responsible_id)")
    .is("done_at", null)
    .not("events.status", "in", "(avbokad,genomford)")
    .order("due_date", { nullsFirst: false })
    .limit(500);
  const { data: people } = await supabase.from("profiles").select("id, full_name, email");
  const name = new Map(((people ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email]));
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => all || r.assignee_id === me.id || (!r.assignee_id && r.events?.responsible_id === me.id),
  );
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const groups: { label: string; list: Row[]; tone?: string }[] = [
    { label: "Försenade", list: rows.filter((r) => r.due_date && r.due_date < today), tone: "text-warn" },
    { label: "I dag och i morgon", list: rows.filter((r) => r.due_date && r.due_date >= today && r.due_date <= tomorrow) },
    { label: "Kommande", list: rows.filter((r) => r.due_date && r.due_date > tomorrow) },
    { label: "Utan datum", list: rows.filter((r) => !r.due_date) },
  ];

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{all ? "Alla öppna uppgifter" : "Mina uppgifter"}</h1>
        <span className="text-sm text-muted">{rows.length} öppna</span>
        <span className="flex-1" />
        <Link className="btn btn-ghost text-sm" href={all ? "/uppgifter" : "/uppgifter?visa=alla"}>{all ? "Visa bara mina" : "Visa allas"}</Link>
      </div>
      <p className="text-sm text-muted max-w-2xl">
        Uppgifter läggs till på evenemanget under Genomförande. Du ser dem som du är ansvarig för, och de utan ansvarig på evenemang där du är ansvarig.
        Du får en påminnelse dagen innan och samma dag.
      </p>
      {rows.length === 0 && <div className="card p-8 text-center text-muted">Inga öppna uppgifter. Snyggt!</div>}
      {groups.filter((g) => g.list.length).map((g) => (
        <section key={g.label} className="grid gap-2">
          <h2 className={`font-display font-semibold ${g.tone ?? ""}`}>{g.label} <span className="text-sm text-muted font-normal">{g.list.length}</span></h2>
          <ul className="card divide-y divide-line">
            {g.list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <form action={toggle.bind(null, r.id, true)}>
                  <button type="submit" className="grid size-5 place-items-center rounded border border-muted hover:border-ok hover:bg-st-genomford-soft" aria-label={`Markera ${r.title} som klar`} />
                </form>
                <span className="grid flex-1 min-w-48">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-xs text-muted">
                    {r.events && <Link className="hover:underline" href={`/evenemang/${r.events.id}#eventsida`}>{r.events.title}</Link>}
                    {r.note ? ` · ${r.note}` : ""}
                    {r.customer_visible ? " · kunden ser" : ""}
                  </span>
                </span>
                {all && <span className="text-xs text-muted">{r.assignee_id ? name.get(r.assignee_id) : "ingen ansvarig"}</span>}
                {r.due_date && <span className={`text-sm tabular-nums ${r.due_date < today ? "text-warn font-semibold" : "text-muted"}`}>{fmtDate(r.due_date)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

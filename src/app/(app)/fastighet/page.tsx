import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { addDays, dayStartIso, fmtDate, fmtTime, isoToDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Fastighet" };

type B = {
  id: string; starts_at: string; ends_at: string; rig_minutes: number; strike_minutes: number; note: string | null; room_id: string;
  rooms: { name: string } | null; setups: { name: string } | null; events: { id: string; title: string; status: string; participants: number | null } | null;
};
const minus = (iso: string, min: number) => new Date(new Date(iso).getTime() - min * 60000).toISOString();
const plus = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60000).toISOString();

function Card({ title, href, count, warn, children }: { title: string; href: string; count?: number; warn?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-4 grid gap-2 content-start">
      <div className="flex items-center gap-2">
        <Link href={href} className="font-semibold hover:underline grow">{title}</Link>
        {count != null && <span className={`rounded-full px-2 text-sm font-semibold tabular-nums ${warn && count > 0 ? "bg-warn text-white" : "bg-sunk"}`}>{count}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function PropertyPage() {
  await requireProfile();
  const supabase = await createClient();
  const today = todayDate();
  const [issues, tasks, blocked, sups, routines, runs, bookings] = await Promise.all([
    supabase.from("room_issues").select("id, title, status, created_at, rooms(name)").neq("status", "klar").order("created_at", { ascending: false }),
    supabase.from("maintenance_tasks").select("id, title, next_due_on, location, rooms(name)").eq("active", true).lte("next_due_on", addDays(today, 7)).order("next_due_on"),
    supabase.from("rooms").select("id, name, blocked_reason").eq("blocked", true).eq("active", true),
    supabase.from("suppliers").select("id, name, area, contract_ends_on").eq("active", true).not("contract_ends_on", "is", null).lte("contract_ends_on", addDays(today, 90)).order("contract_ends_on"),
    supabase.from("routines").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("routine_runs").select("routine_id, completed_at, signed_name").gte("started_at", dayStartIso(today)),
    supabase
      .from("bookings")
      .select("id, starts_at, ends_at, rig_minutes, strike_minutes, note, room_id, rooms(name), setups(name), events!inner(id, title, status, participants)")
      .in("events.status", ["preliminar", "bekraftad"])
      .lt("starts_at", dayStartIso(addDays(today, 2)))
      .gt("ends_at", dayStartIso(today))
      .order("starts_at"),
  ]);
  const bl = (bookings.data ?? []) as unknown as B[];
  const { data: lays } = bl.length
    ? await supabase.from("layouts").select("id, name, booking_id").in("booking_id", bl.map((b) => b.id))
    : { data: [] };
  const layoutOf = new Map(((lays ?? []) as { id: string; name: string; booking_id: string }[]).map((l) => [l.booking_id, l]));
  const openIssues = (issues.data ?? []) as unknown as { id: string; title: string; status: string; created_at: string; rooms: { name: string } | null }[];
  const due = (tasks.data ?? []) as unknown as { id: string; title: string; next_due_on: string; location: string | null; rooms: { name: string } | null }[];
  const rr = (runs.data ?? []) as { routine_id: string; completed_at: string | null; signed_name: string | null }[];
  const days = [today, addDays(today, 1)].map((d) => ({
    d,
    items: bl.filter((b) => isoToDate(b.starts_at) <= d && isoToDate(b.ends_at) >= d),
  }));


  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Fastighet</h1>
        <p className="text-sm text-muted">Det som behöver göras i huset i dag: fel, tillsyn, öppna och stänga, och vad som ska ställas i ordning.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Felanmälningar" href="/fastighet/fel" count={openIssues.length} warn={openIssues.some((x) => x.status === "ny")}>
          <ul className="grid gap-1 text-sm">
            {openIssues.slice(0, 5).map((x) => (
              <li key={x.id}><Link className="hover:underline" href={`/fastighet/fel#${x.id}`}><span className={x.status === "ny" ? "font-semibold" : ""}>{x.title}</span></Link> <span className="text-muted">· {x.rooms?.name}</span></li>
            ))}
            {!openIssues.length && <li className="text-muted">Inga öppna fel.</li>}
          </ul>
        </Card>
        <Card title="Tillsyn närmaste veckan" href="/fastighet/underhall" count={due.length} warn={due.some((x) => x.next_due_on < today)}>
          <ul className="grid gap-1 text-sm">
            {due.slice(0, 6).map((x) => (
              <li key={x.id} className="flex gap-2">
                <Link className="hover:underline grow" href={`/fastighet/underhall#${x.id}`}>{x.title}</Link>
                <span className={x.next_due_on < today ? "text-warn font-semibold" : x.next_due_on === today ? "font-semibold" : "text-muted"}>
                  {x.next_due_on < today ? "försenad" : x.next_due_on === today ? "i dag" : fmtDate(x.next_due_on)}
                </span>
              </li>
            ))}
            {!due.length && <li className="text-muted">Inget som förfaller.</li>}
          </ul>
        </Card>
        <Card title="Öppna och stänga i dag" href="/personal/rutiner">
          <ul className="grid gap-1 text-sm">
            {((routines.data ?? []) as { id: string; name: string }[]).map((r) => {
              const done = rr.find((x) => x.routine_id === r.id && x.completed_at);
              const started = rr.some((x) => x.routine_id === r.id);
              return (
                <li key={r.id} className="flex gap-2">
                  <span className="grow">{r.name}</span>
                  <span className={done ? "text-ok" : started ? "" : "text-muted"}>{done ? `✓ ${fmtTime(done.completed_at!)} ${done.signed_name ?? ""}` : started ? "påbörjad" : "inte gjord"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Spärrade lokaler och avtal" href="/fastighet/leverantorer">
          <ul className="grid gap-1 text-sm">
            {((blocked.data ?? []) as { id: string; name: string; blocked_reason: string | null }[]).map((r) => (
              <li key={r.id}><Link className="text-warn font-semibold hover:underline" href={`/lokaler/${r.id}#lokalkort`}>{r.name} spärrad</Link>{r.blocked_reason ? <span className="text-muted"> · {r.blocked_reason}</span> : null}</li>
            ))}
            {((sups.data ?? []) as { id: string; name: string; area: string | null; contract_ends_on: string }[]).map((s) => (
              <li key={s.id}><Link className="hover:underline" href={`/fastighet/leverantorer#${s.id}`}>{s.name}</Link> <span className={s.contract_ends_on < today ? "text-warn" : "text-muted"}>· avtal {s.contract_ends_on < today ? "gick ut" : "går ut"} {fmtDate(s.contract_ends_on)}</span></li>
            ))}
            {!(blocked.data ?? []).length && !(sups.data ?? []).length && <li className="text-muted">Inga spärrade lokaler och inga avtal som går ut snart.</li>}
          </ul>
        </Card>
      </div>

      {days.map(({ d, items }) => (
        <section key={d} className="grid gap-2">
          <h2 className="font-semibold">{d === today ? "I dag" : "I morgon"} <span className="text-muted font-normal">{fmtDate(d)}</span></h2>
          {items.length ? (
            <div className="card p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sunk text-left">
                  <tr><th className="px-3 py-2">Ställ från</th><th className="px-2">Pågår</th><th className="px-2">Riv till</th><th className="px-2">Lokal</th><th className="px-2">Evenemang</th><th className="px-2">Möblering</th></tr>
                </thead>
                <tbody>
                  {items.map((b) => {
                    const l = layoutOf.get(b.id);
                    return (
                      <tr key={b.id} className="border-t border-line align-top">
                        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{b.rig_minutes ? fmtTime(minus(b.starts_at, b.rig_minutes)) : "–"}</td>
                        <td className="px-2 tabular-nums whitespace-nowrap">{isoToDate(b.starts_at) === d ? fmtTime(b.starts_at) : "…"}–{isoToDate(b.ends_at) === d ? fmtTime(b.ends_at) : "…"}</td>
                        <td className="px-2 tabular-nums whitespace-nowrap">{b.strike_minutes ? fmtTime(plus(b.ends_at, b.strike_minutes)) : "–"}</td>
                        <td className="px-2">{b.rooms?.name}</td>
                        <td className="px-2">
                          <Link className="hover:underline" href={`/evenemang/${b.events?.id}`}>{b.events?.title}</Link>
                          {b.events?.status === "preliminar" && <span className="text-xs text-muted"> (preliminär)</span>}
                          {b.events?.participants ? <span className="text-xs text-muted"> · {b.events.participants} gäster</span> : null}
                          {b.note && <span className="block text-xs text-muted">{b.note}</span>}
                        </td>
                        <td className="px-2">
                          {l ? <Link className="underline" href={`/mobleringar/${l.id}/utskrift`}>{l.name}</Link> : b.setups?.name ?? <span className="text-muted">–</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted">Inga bokningar.</p>}
        </section>
      ))}
      <p className="text-sm"><Link className="underline" href="/mobleringar/lager">Möbler per dag</Link> · <Link className="underline" href="/dagsblad">Dagsblad</Link></p>
    </div>
  );
}

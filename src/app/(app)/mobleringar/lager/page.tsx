import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { addDays, dayShort, fmtDayMonth, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Möbler per dag" };

type R = { day: string; furniture_id: string; name: string; needed: number; stock: number | null; events: { event_id: string; title: string; n: number }[] };

export default async function FurnitureByDayPage({ searchParams }: { searchParams: Promise<{ dagar?: string; alla?: string }> }) {
  const sp = await searchParams;
  await requireProfile();
  const days = Math.min(180, Math.max(7, Number(sp.dagar) || 60));
  const today = todayDate();
  const supabase = await createClient();
  const { data } = await supabase.rpc("furniture_by_day", { p_from: today, p_to: addDays(today, days) });
  const rows = (data ?? []) as R[];
  const showAll = sp.alla === "1";
  const byDay = new Map<string, R[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const short = (r: R) => r.stock != null && r.needed > r.stock;
  const list = [...byDay].filter(([, rs]) => showAll || rs.some(short));
  const noStock = [...new Set(rows.filter((r) => r.stock == null).map((r) => r.name))];

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Möbler per dag</h1>
        <p className="text-sm text-muted max-w-3xl">
          Hur många möbler evenemangens ritningar kräver samma dag, jämfört med lagret. Inom ett evenemang räknas det högsta antalet per dag, eftersom en sal
          som ställs om använder samma möbler. Lagret anges under <Link className="underline" href="/installningar/moblering">Möbler och inventarier</Link>.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[30, 60, 120].map((n) => (
          <Link key={n} className={`btn ${n === days ? "btn-primary" : ""}`} href={`/mobleringar/lager?dagar=${n}${showAll ? "&alla=1" : ""}`}>{n} dagar</Link>
        ))}
        <span className="flex-1" />
        <Link className="btn btn-ghost" href={`/mobleringar/lager?dagar=${days}${showAll ? "" : "&alla=1"}`}>{showAll ? "Visa bara brist" : "Visa alla dagar"}</Link>
      </div>
      {noStock.length > 0 && (
        <p className="rounded-lg bg-sunk px-4 py-2 text-sm text-muted">Lagersaldo saknas för {noStock.join(", ")}, så de kan inte kontrolleras.</p>
      )}
      {list.length === 0 ? (
        <div className="card p-8 text-center text-muted">{showAll ? "Inga ritningar på evenemang de kommande dagarna." : "Möblerna räcker alla dagar."}</div>
      ) : (
        list.map(([day, rs]) => (
          <section key={day} className="card p-4 grid gap-2">
            <h2 className="font-display font-semibold">
              {dayShort(day)} {fmtDayMonth(day)} {day.slice(0, 4)}{" "}
              <Link className="text-sm font-normal text-muted hover:underline" href={`/dagsblad?datum=${day}`}>Dagsblad</Link>
            </h2>
            <table className="table text-sm">
              <thead><tr><th className="pl-0">Möbel</th><th className="text-right">Behövs</th><th className="text-right">I lager</th><th>Evenemang</th></tr></thead>
              <tbody>
                {rs.filter((r) => showAll || short(r)).map((r) => (
                  <tr key={r.furniture_id} className={short(r) ? "text-warn" : ""}>
                    <td className="pl-0 font-semibold">{r.name}</td>
                    <td className="text-right tabular-nums">{r.needed}</td>
                    <td className="text-right tabular-nums">{r.stock ?? "–"}</td>
                    <td className="text-fg">
                      {r.events.map((e, i) => (
                        <span key={e.event_id}>{i ? ", " : ""}<Link className="hover:underline" href={`/evenemang/${e.event_id}#moblering`}>{e.title}</Link> ({e.n})</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

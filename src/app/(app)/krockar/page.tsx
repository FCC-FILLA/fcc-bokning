import Link from "next/link";
import { fmtMinutes, fmtRange, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import type { BookingConflict, ChangeoverWarning } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

export const metadata = { title: "Krockar" };

export default async function ConflictsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("booking_conflicts")
    .select("*")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");

  const { data: coData } = await supabase
    .from("changeover_warnings")
    .select("*")
    .gte("next_starts_at", new Date().toISOString())
    .order("ends_at");
  const changeovers = (coData ?? []) as ChangeoverWarning[];

  // Varje krock finns i båda riktningarna. Behåll en rad per par.
  const seen = new Set<string>();
  const conflicts = ((data ?? []) as BookingConflict[]).filter((c) => {
    const key = [c.booking_id, c.other_booking_id].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Krockar</h1>
        <p className="text-sm text-muted max-w-2xl">
          Kommande bokningar där samma lokal, eller en sal och en del av den, är bokad samtidigt och minst ett av evenemangen är bekräftat.
          Förfrågningar och preliminära som ligger på samma tid räknas inte som krockar; de står i optionskö på evenemanget. Avbokade och
          genomförda evenemang räknas inte.
        </p>
      </div>
      {conflicts.length === 0 ? (
        <div className="card p-10 text-center text-muted">Inga krockar. Allt ser bra ut.</div>
      ) : (
        <ul className="grid gap-3">
          {conflicts.map((c) => (
            <li key={c.booking_id + c.other_booking_id} className="card p-4 grid gap-3 sm:grid-cols-2 border-l-4 border-l-warn">
              {[
                { id: c.event_id, title: c.event_title, status: c.event_status, room: c.room_name, s: c.starts_at, e: c.ends_at },
                { id: c.other_event_id, title: c.other_event_title, status: c.other_event_status, room: c.other_room_name, s: c.other_starts_at, e: c.other_ends_at },
              ].map((x, i) => (
                <div key={i} className="grid gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-semibold hover:underline underline-offset-2" href={`/evenemang/${x.id}`}>{x.title}</Link>
                    <StatusPill status={x.status} />
                  </div>
                  <p className="text-sm">{x.room}</p>
                  <p className="text-sm text-muted">{fmtRange(x.s, x.e)}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-1 mt-4" id="omstallning">
        <h2 className="text-xl font-semibold">För kort omställning</h2>
        <p className="text-sm text-muted max-w-2xl">
          Bokningar som följer på varandra i samma lokal där tiden emellan är kortare än riv + omställning + rigg. Omställningstiderna
          ändras under <Link className="underline" href="/installningar/omstallning">Inställningar → Omställning</Link>.
        </p>
      </div>
      {changeovers.length === 0 ? (
        <div className="card p-6 text-center text-muted">Ingen för kort omställning.</div>
      ) : (
        <ul className="grid gap-3">
          {changeovers.map((c) => (
            <li key={c.booking_id + c.next_booking_id} className="card p-4 grid gap-2 border-l-4 border-l-st-preliminar">
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold">{c.room_name === c.next_room_name ? c.room_name : `${c.room_name} → ${c.next_room_name}`}</span>
                <span className="text-muted">{fmtTime(c.ends_at)} → {fmtTime(c.next_starts_at)}</span>
                <span className="text-st-preliminar font-semibold">{fmtMinutes(c.gap_minutes)} emellan, behövs {fmtMinutes(c.needed_minutes)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.event_id}#bokningar`}>{c.event_title}</Link>{" "}
                  <StatusPill status={c.event_status} />
                  <p className="text-muted">{fmtRange(c.starts_at, c.ends_at)} · {c.setup_name ?? "möblering ej bestämd"}{c.strike_minutes ? ` · riv ${fmtMinutes(c.strike_minutes)}` : ""}</p>
                </div>
                <div>
                  <Link className="font-semibold hover:underline" href={`/evenemang/${c.next_event_id}#bokningar`}>{c.next_event_title}</Link>{" "}
                  <StatusPill status={c.next_event_status} />
                  <p className="text-muted">{fmtRange(c.next_starts_at, c.next_ends_at)} · {c.next_setup_name ?? "möblering ej bestämd"}{c.next_rig_minutes ? ` · rigg ${fmtMinutes(c.next_rig_minutes)}` : ""}</p>
                </div>
              </div>
              <p className="text-xs text-muted">Omställning {c.setup_name ?? "okänd"} → {c.next_setup_name ?? "okänd"}: {fmtMinutes(c.changeover_minutes)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

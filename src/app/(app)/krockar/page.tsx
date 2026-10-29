import Link from "next/link";
import { fmtRange } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import type { BookingConflict } from "@/lib/types";
import { StatusPill } from "@/components/status-pill";

export const metadata = { title: "Krockar" };

export default async function ConflictsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("booking_conflicts")
    .select("*")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");

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
    </>
  );
}

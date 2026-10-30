import { withRig } from "@/lib/rigg";
import Link from "next/link";
import { addDays, dayLong, dayStartIso, fmtDayMonth, fmtTime, isoToDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type EventRow, type EventStatus } from "@/lib/types";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Dagsblad" };

type Row = {
  id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  setup_id: string | null;
  note: string | null;
  rig_minutes: number;
  strike_minutes: number;
  event_id: string;
  rooms: { name: string } | null;
  setups: { name: string } | null;
  events: EventRow & {
    companies: { name: string } | null;
    contacts: { name: string; phone: string | null; email: string | null } | null;
    profiles: { full_name: string } | null;
  };
};

export default async function DaySheetPage({ searchParams }: { searchParams: Promise<{ datum?: string; avbokade?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : todayDate();
  const statuses: EventStatus[] = ["forfragan", "preliminar", "bekraftad", "genomford"];

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, room_id, starts_at, ends_at, setup_id, note, rig_minutes, strike_minutes, event_id, rooms(name), setups(name), events!inner(*, companies(name), contacts(name, phone, email), profiles!events_responsible_id_fkey(full_name))",
    )
    .in("events.status", statuses)
    .lt("starts_at", dayStartIso(addDays(date, 1)))
    .gt("ends_at", dayStartIso(date))
    .order("starts_at");
  const rows = (data ?? []) as unknown as Row[];

  const events = new Map<string, { ev: Row["events"]; slots: Row[] }>();
  for (const r of rows) {
    const e = events.get(r.event_id) ?? { ev: r.events, slots: [] };
    e.slots.push(r);
    events.set(r.event_id, e);
  }
  const list = [...events.values()];
  const t = (iso: string, edge: "start" | "end") =>
    isoToDate(iso) === date ? fmtTime(iso) : edge === "start" ? `${fmtDayMonth(isoToDate(iso))} ${fmtTime(iso)}` : `${fmtDayMonth(isoToDate(iso))} ${fmtTime(iso)}`;

  return (
    <div className="grid gap-5 max-w-5xl print:max-w-none print:gap-3">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link className="btn" href={`/dagsblad?datum=${addDays(date, -1)}`} aria-label="Föregående dag">←</Link>
        <Link className="btn" href="/dagsblad">Idag</Link>
        <Link className="btn" href={`/dagsblad?datum=${addDays(date, 1)}`} aria-label="Nästa dag">→</Link>
        <form method="get" className="flex gap-2">
          <input className="input" type="date" name="datum" defaultValue={date} aria-label="Välj datum" />
          <button className="btn" type="submit">Visa</button>
        </form>
        <span className="flex-1" />
        <PrintButton />
      </div>

      <header className="flex items-baseline gap-3 border-b-2 border-brand pb-2">
        <h1 className="text-2xl font-semibold">Dagsblad {dayLong(date).toLowerCase()} {fmtDayMonth(date)} {date.slice(0, 4)}</h1>
        <span className="flex-1" />
        <span className="text-sm text-muted">{list.length} evenemang</span>
      </header>

      {list.length === 0 && <p className="text-muted">Inga bokningar den här dagen.</p>}

      {list.map(({ ev, slots }) => (
        <article key={ev.id} className="card p-5 grid gap-3 break-inside-avoid print:shadow-none print:border-fg/30">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold">
              <Link href={`/evenemang/${ev.id}`} className="hover:underline">{ev.title}</Link>
            </h2>
            <span className={`pill st-${ev.status}`}>{STATUS_LABEL[ev.status]}</span>
            <span className="flex-1" />
            {ev.participants != null && <span className="text-sm">{ev.participants} deltagare</span>}
          </div>

          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <p><span className="label block">Kund</span>{ev.companies?.name ?? "–"}</p>
            <p>
              <span className="label block">Kontakt</span>
              {ev.contacts?.name ?? "–"}
              {ev.contacts?.phone && <span className="block">{ev.contacts.phone}</span>}
            </p>
            <p><span className="label block">Ansvarig hos FCC</span>{ev.profiles?.full_name || "–"}</p>
          </div>

          <table className="table text-sm">
            <thead><tr><th className="pl-0">Tid</th><th>Lokal</th><th>Möblering</th><th>Notering</th></tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <td className="pl-0 font-mono whitespace-nowrap">{t(s.starts_at, "start")}–{t(s.ends_at, "end")}</td>
                  <td className="font-semibold">{s.rooms?.name}</td>
                  <td>{s.setups?.name ?? "–"}</td>
                  <td>
                    {s.note ?? ""}
                    {(s.rig_minutes || s.strike_minutes) ? (
                      <span className="block text-xs text-muted">
                        {s.rig_minutes ? `Rigg från ${fmtTime(withRig(s).from)}` : ""}{s.rig_minutes && s.strike_minutes ? " · " : ""}
                        {s.strike_minutes ? `riv till ${fmtTime(withRig(s).to)}` : ""}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(ev.technical_info || ev.hospitality_info || ev.internal_notes || ev.description) && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {ev.technical_info && <Info label="Teknik" text={ev.technical_info} />}
              {ev.hospitality_info && <Info label="Mat och hospitality" text={ev.hospitality_info} />}
              {ev.description && <Info label="Beskrivning" text={ev.description} />}
              {ev.internal_notes && <Info label="Interna anteckningar" text={ev.internal_notes} />}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Info({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="label block">{label}</span>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

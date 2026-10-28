import { fmtDate, fmtRange, fmtTime } from "@/lib/datum";
import { QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/offert";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type EventStatus } from "@/lib/types";

type LogRow = {
  id: number;
  at: string;
  user_id: string | null;
  table_name: string;
  action: "skapad" | "andrad" | "borttagen";
  summary: string | null;
  changes: Record<string, { fran: unknown; till: unknown }> | { starts_at: string; ends_at: string } | null;
};

const FIELD: Record<string, string> = {
  title: "namn", status: "status", event_type_id: "typ", company_id: "kund", contact_id: "kontakt",
  responsible_id: "ansvarig", participants: "deltagare", option_expires_on: "option", description: "beskrivning",
  technical_info: "teknik", hospitality_info: "mat och hospitality", internal_notes: "interna anteckningar",
  room_id: "lokal", starts_at: "start", ends_at: "slut", setup_id: "möblering", note: "notering",
  valid_until: "giltighet", intro: "inledning", terms: "villkor", salesperson_id: "säljare", event_id: "evenemang",
  sent_at: "skickad", accepted_at: "accepterad", declined_at: "avböjd", accepted_name: "godkänd av",
  accepted_email: "e-post", customer_comment: "kundens kommentar",
};
const LONG = new Set(["description", "technical_info", "hospitality_info", "internal_notes", "intro", "terms", "customer_comment"]);
const HIDDEN = new Set(["accepted_email", "sent_at", "accepted_at", "declined_at"]);

function value(field: string, v: unknown) {
  if (v == null || v === "") return "tomt";
  if (field === "status") return STATUS_LABEL[v as EventStatus] ?? QUOTE_STATUS_LABEL[v as QuoteStatus] ?? String(v);
  if (field === "starts_at" || field === "ends_at") return fmtDate(String(v)) + " " + fmtTime(String(v));
  if (field.endsWith("_on") || field === "valid_until") return fmtDate(String(v));
  return String(v);
}

function describe(r: LogRow) {
  const what =
    r.table_name === "bookings" ? `Bokning ${r.summary ?? ""}` : r.table_name === "quotes" ? (r.summary ?? "Offert") : r.table_name === "events" ? "Evenemanget" : (r.summary ?? r.table_name);
  if (r.action === "skapad" || r.action === "borttagen") {
    const c = r.changes as { starts_at?: string; ends_at?: string } | null;
    const when = c?.starts_at && c?.ends_at ? `, ${fmtRange(c.starts_at, c.ends_at)}` : "";
    return `${what} ${r.action === "skapad" ? "skapades" : "togs bort"}${when}`;
  }
  const changes = Object.entries((r.changes ?? {}) as Record<string, { fran: unknown; till: unknown }>).filter(([k]) => !HIDDEN.has(k));
  if (!changes.length) return `${what} ändrades`;
  const parts = changes.map(([k, v]) =>
    LONG.has(k) || k.endsWith("_id") ? (FIELD[k] ?? k) : `${FIELD[k] ?? k} ${value(k, v.fran)} → ${value(k, v.till)}`,
  );
  return `${what}: ${parts.join(", ")}`;
}

/** Ändringshistorik för ett evenemang eller en offert. */
export async function History({ eventId, quoteId }: { eventId?: string; quoteId?: string }) {
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(60);
  q = quoteId ? q.eq("quote_id", quoteId) : q.eq("event_id", eventId!);
  const [{ data }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name, email")]);
  const rows = (data ?? []) as LogRow[];
  const name = new Map(((people ?? []) as { id: string; full_name: string; email: string | null }[]).map((p) => [p.id, p.full_name || p.email || "Okänd"]));

  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-semibold">Historik ({rows.length}{rows.length === 60 ? "+" : ""})</summary>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Inga ändringar registrerade ännu.</p>
      ) : (
        <ol className="mt-3 grid gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-line pb-2 last:border-0">
              <span className="text-muted">{fmtDate(r.at)} {fmtTime(r.at)}</span>
              <span>
                {describe(r)}
                <span className="text-muted"> · {r.user_id ? name.get(r.user_id) ?? "Okänd" : "Kunden via länken"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

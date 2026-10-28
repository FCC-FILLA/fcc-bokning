import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineKind, QuoteStatus } from "@/lib/offert";

/** Det kunden får se av en offert. Samma form som databasfunktionen public_quote(). Inga kostnader eller marginaler. */
export type QuoteDoc = {
  number: number;
  title: string;
  status: QuoteStatus;
  valid_until: string | null;
  intro: string | null;
  terms: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  declined_at: string | null;
  company_name: string | null;
  contact_name: string | null;
  salesperson_name: string | null;
  salesperson_email: string | null;
  event_title: string | null;
  bookings: { room: string; starts_at: string; ends_at: string }[];
  lines: {
    group: string;
    group_order: number;
    description: string;
    line_date: string | null;
    quantity: number;
    unit: string;
    unit_price: number;
    discount_pct: number;
    vat_rate: number;
    kind: LineKind;
  }[];
};

export function normalizeDoc(raw: QuoteDoc): QuoteDoc {
  return {
    ...raw,
    lines: (raw.lines ?? []).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      discount_pct: Number(l.discount_pct),
      vat_rate: Number(l.vat_rate),
    })),
    bookings: raw.bookings ?? [],
  };
}

/** Kundens version via delningslänken (fungerar utan inloggning). */
export async function loadPublicDoc(supabase: SupabaseClient, token: string): Promise<QuoteDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await supabase.rpc("public_quote", { p_token: token });
  if (error || !data) return null;
  return normalizeDoc(data as QuoteDoc);
}

/** Samma dokument för inloggad personal, oavsett status (även utkast). */
export async function loadInternalDoc(supabase: SupabaseClient, id: string): Promise<QuoteDoc | null> {
  const { data: q } = await supabase
    .from("quotes")
    .select("*, companies(name), contacts(name), profiles!quotes_salesperson_id_fkey(full_name, email), events(title)")
    .eq("id", id)
    .maybeSingle();
  if (!q) return null;
  const [{ data: lines }, { data: groups }, { data: bookings }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    supabase.from("article_groups").select("*"),
    q.event_id
      ? supabase.from("bookings").select("starts_at, ends_at, rooms(name)").eq("event_id", q.event_id).order("starts_at")
      : Promise.resolve({ data: [] as { starts_at: string; ends_at: string; rooms: { name: string } | null }[] }),
  ]);
  const g = new Map(((groups ?? []) as { id: string; name: string; sort_order: number }[]).map((x) => [x.id, x]));
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return normalizeDoc({
    number: q.number,
    title: q.title,
    status: q.status,
    valid_until: q.valid_until,
    intro: q.intro,
    terms: q.terms,
    sent_at: q.sent_at,
    accepted_at: q.accepted_at,
    accepted_name: q.accepted_name,
    declined_at: q.declined_at,
    company_name: one(q.companies)?.name ?? null,
    contact_name: one(q.contacts)?.name ?? null,
    salesperson_name: one(q.profiles)?.full_name ?? null,
    salesperson_email: one(q.profiles)?.email ?? null,
    event_title: one(q.events)?.title ?? null,
    bookings: ((bookings ?? []) as unknown as { starts_at: string; ends_at: string; rooms: { name: string } | null }[]).map((b) => ({
      room: one(b.rooms)?.name ?? "",
      starts_at: b.starts_at,
      ends_at: b.ends_at,
    })),
    lines: ((lines ?? []) as Record<string, unknown>[])
      .map((l) => ({
        group: g.get(l.group_id as string)?.name ?? "",
        group_order: g.get(l.group_id as string)?.sort_order ?? 99,
        description: l.description as string,
        line_date: l.line_date as string | null,
        quantity: l.quantity as number,
        unit: l.unit as string,
        unit_price: l.unit_price as number,
        discount_pct: l.discount_pct as number,
        vat_rate: l.vat_rate as number,
        kind: l.kind as LineKind,
      }))
      .sort((a, b) => a.group_order - b.group_order),
  });
}

/** Rader grupperade i prislistans ordning. */
export function groupLines(lines: QuoteDoc["lines"]) {
  const out = new Map<string, QuoteDoc["lines"]>();
  for (const l of [...lines].sort((a, b) => a.group_order - b.group_order)) {
    out.set(l.group, [...(out.get(l.group) ?? []), l]);
  }
  return out;
}

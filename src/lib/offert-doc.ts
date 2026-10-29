import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineKind, QuoteStatus } from "@/lib/offert";

export type QuoteRoom = { name: string; image: string | null; text: string | null; kvm: number | null; max: number | null };

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
  participants: number | null;
  /** De bokade lokalerna med bild och säljtext, i lokallistans ordning. */
  rooms: QuoteRoom[];
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
    /** Foto (lokalens eller artikelns egen), annars null och då visas ikonen. */
    image: string | null;
    gallery: string[];
    icon: string;
    /** Artikelns text till kunden. */
    text: string | null;
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
      image: l.image ?? null,
      gallery: l.gallery ?? [],
      icon: l.icon ?? "box",
      text: l.text ?? null,
    })),
    bookings: raw.bookings ?? [],
    participants: raw.participants ?? null,
    rooms: (raw.rooms ?? []).map((r) => ({ ...r, kvm: r.kvm == null ? null : Number(r.kvm), max: r.max == null ? null : Number(r.max) })),
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
    .select("*, companies(name), contacts(name), profiles!quotes_salesperson_id_fkey(full_name, email), events(title, participants)")
    .eq("id", id)
    .maybeSingle();
  if (!q) return null;
  const [{ data: lines }, { data: groups }, { data: bookings }, { data: allRooms }, { data: caps }] = await Promise.all([
    supabase.from("quote_lines").select("*, articles(icon, image_path, description, room_id)").eq("quote_id", id).order("sort_order"),
    supabase.from("article_groups").select("*"),
    q.event_id
      ? supabase.from("bookings").select("starts_at, ends_at, room_id").eq("event_id", q.event_id).order("starts_at")
      : Promise.resolve({ data: [] as { starts_at: string; ends_at: string; room_id: string }[] }),
    supabase.from("rooms").select("id, name, parent_id, image_path, sales_text, kvm, sort_order"),
    supabase.from("room_capacities").select("room_id, capacity"),
  ]);
  type Art = { icon: string | null; image_path: string | null; description: string | null; room_id: string | null };
  // Samma regler som line_media() i databasen.
  const media = (a: Art | null, groupIcon: string | undefined) => {
    const r = a?.room_id ? roomById.get(a.room_id) : undefined;
    const parent = r?.parent_id ? roomById.get(r.parent_id) : undefined;
    return {
      image: a?.image_path ?? r?.image_path ?? parent?.image_path ?? null,
      icon: a?.icon ?? groupIcon ?? "box",
      text: a?.description ?? r?.sales_text ?? null,
      gallery: r ? [...new Set([...roomById.values()].filter((x) => x.image_path && (x.id === r.id || x.parent_id === r.id)).map((x) => x.image_path!))] : [],
    };
  };
  type R = { id: string; name: string; parent_id: string | null; image_path: string | null; sales_text: string | null; kvm: number | null; sort_order: number };
  const roomById = new Map(((allRooms ?? []) as R[]).map((r) => [r.id, r]));
  const maxCap = new Map<string, number>();
  for (const c of (caps ?? []) as { room_id: string; capacity: number }[]) maxCap.set(c.room_id, Math.max(maxCap.get(c.room_id) ?? 0, c.capacity));
  const bookedRooms = [...new Set(((bookings ?? []) as { room_id: string }[]).map((b) => b.room_id))]
    .map((rid) => roomById.get(rid))
    .filter((r): r is R => !!r)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => {
      const parent = r.parent_id ? roomById.get(r.parent_id) : undefined;
      return { name: r.name, image: r.image_path ?? parent?.image_path ?? null, text: r.sales_text, kvm: r.kvm, max: maxCap.get(r.id) ?? null };
    });
  const g = new Map(((groups ?? []) as { id: string; name: string; sort_order: number; icon: string }[]).map((x) => [x.id, x]));
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
    participants: one(q.events)?.participants ?? null,
    rooms: bookedRooms,
    bookings: ((bookings ?? []) as { starts_at: string; ends_at: string; room_id: string }[]).map((b) => ({
      room: roomById.get(b.room_id)?.name ?? "",
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
        ...media(one(l.articles as Art | Art[] | null), g.get(l.group_id as string)?.icon),
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

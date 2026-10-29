import type { SupabaseClient } from "@supabase/supabase-js";
import { toCompany, type Company } from "@/lib/foretag";
import type { Lang } from "@/lib/sprak";
import type { LineKind, QuoteStatus } from "@/lib/offert";

export type QuoteRoom = { name: string; image: string | null; gallery: string[]; text: string | null; kvm: number | null; max: number | null };

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
  /** Offertens språk. Namn och texter kommer redan översatta från databasen. */
  language: Lang;
  /** Säljarens företagsuppgifter (Inställningar → Företagsuppgifter). */
  company: Company;
  look: QuoteLook;
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

/** Hur offerten ser ut (Inställningar → Offert). */
export type QuoteLook = {
  cover: string;
  closing: string;
  showRooms: boolean;
  showProgram: boolean;
  showAddons: boolean;
  showImages: boolean;
};

/** Som QuoteDoc men med inställningarna orörda, som databasen skickar dem. */
type RawDoc = Omit<QuoteDoc, "company" | "look" | "language"> & { language?: string; settings?: Record<string, string>; company?: unknown };

export function lookFrom(settings: Record<string, string> | undefined, language: Lang): QuoteLook {
  const on = (k: string) => (settings?.[k] ?? "1") !== "0";
  return {
    cover: settings?.look_cover ?? "",
    closing: (language === "en" ? settings?.look_closing_en : settings?.look_closing) ?? "",
    showRooms: on("look_show_rooms"),
    showProgram: on("look_show_program"),
    showAddons: on("look_show_addons"),
    showImages: on("look_show_images"),
  };
}

export function normalizeDoc(raw: RawDoc): QuoteDoc {
  const language: Lang = raw.language === "en" ? "en" : "sv";
  const settings = raw.settings ?? {};
  const company = Object.fromEntries(
    Object.entries(settings).filter(([k]) => k.startsWith("company_")).map(([k, v]) => [k.slice(8), v]),
  );
  return {
    ...raw,
    language,
    look: lookFrom(settings, language),
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
    company: toCompany(company),
    rooms: (raw.rooms ?? []).map((r) => ({ ...r, gallery: r.gallery ?? [], kvm: r.kvm == null ? null : Number(r.kvm), max: r.max == null ? null : Number(r.max) })),
  };
}

/** Kundens version via delningslänken (fungerar utan inloggning). */
export async function loadPublicDoc(supabase: SupabaseClient, token: string): Promise<QuoteDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await supabase.rpc("public_quote", { p_token: token });
  if (error || !data) return null;
  return normalizeDoc(data as RawDoc);
}

/** Samma dokument för inloggad personal, oavsett status (även utkast). */
export async function loadInternalDoc(supabase: SupabaseClient, id: string): Promise<QuoteDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.rpc("quote_doc", { p_quote: id });
  if (error || !data) return null;
  return normalizeDoc(data as RawDoc);
}

/** Rader grupperade i prislistans ordning. */
export function groupLines(lines: QuoteDoc["lines"]) {
  const out = new Map<string, QuoteDoc["lines"]>();
  for (const l of [...lines].sort((a, b) => a.group_order - b.group_order)) {
    out.set(l.group, [...(out.get(l.group) ?? []), l]);
  }
  return out;
}

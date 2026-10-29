// Typer som speglar databasschemat i supabase/migrations.

export type AppRole = "admin" | "bokare" | "produktion" | "lasare" | "personal";
export type EventStatus = "forfragan" | "preliminar" | "bekraftad" | "genomford" | "avbokad";

export const STATUS_LABEL: Record<EventStatus, string> = {
  forfragan: "Förfrågan",
  preliminar: "Preliminär",
  bekraftad: "Bekräftad",
  genomford: "Genomförd",
  avbokad: "Avbokad",
};
export const STATUSES = Object.keys(STATUS_LABEL) as EventStatus[];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  bokare: "Bokare",
  produktion: "Produktion",
  lasare: "Läsbehörighet",
  personal: "Personal",
};

export type Profile = { id: string; full_name: string; email: string | null; role: AppRole; active: boolean };

export type Room = {
  id: string;
  site_id: string;
  parent_id: string | null;
  name: string;
  short_name: string | null;
  kvm: number | null;
  kvm_note: string | null;
  note: string | null;
  bookable: boolean;
  active: boolean;
  sort_order: number;
};

export type Setup = { id: string; name: string; sort_order: number };
export type RoomCapacity = { room_id: string; setup_id: string; capacity: number };

export type Company = {
  id: string;
  name: string;
  org_nr: string | null;
  email: string | null;
  phone: string | null;
  invoice_address: string | null;
  invoice_reference: string | null;
  notes: string | null;
};

export type Contact = {
  id: string;
  company_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export type EventType = { id: string; name: string; sort_order: number };

export type EventRow = {
  id: string;
  title: string;
  status: EventStatus;
  event_type_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  responsible_id: string | null;
  participants: number | null;
  option_expires_on: string | null;
  description: string | null;
  technical_info: string | null;
  hospitality_info: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EventOverview = EventRow & {
  company_name: string | null;
  contact_name: string | null;
  event_type_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  booking_count: number;
};

export type Booking = {
  id: string;
  event_id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  setup_id: string | null;
  note: string | null;
};

export type BookingConflict = {
  booking_id: string;
  event_id: string;
  event_title: string;
  event_status: EventStatus;
  room_name: string;
  starts_at: string;
  ends_at: string;
  other_booking_id: string;
  other_event_id: string;
  other_event_title: string;
  other_event_status: EventStatus;
  other_room_name: string;
  other_starts_at: string;
  other_ends_at: string;
};

export type ArticleGroup = { id: string; name: string; sort_order: number };

export type Article = {
  id: string;
  article_no: string | null;
  name: string;
  group_id: string;
  unit: string;
  price: number | null;
  cost: number;
  vat_rate: number;
  room_id: string | null;
  description: string | null;
  icon: string | null;
  image_path: string | null;
  active: boolean;
  sort_order: number;
};

export type Quote = {
  id: string;
  number: number;
  title: string;
  status: "utkast" | "skickad" | "accepterad" | "avbojd";
  event_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  salesperson_id: string | null;
  valid_until: string | null;
  intro: string | null;
  terms: string | null;
  language: "sv" | "en";
  share_token: string;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_email: string | null;
  declined_at: string | null;
  customer_comment: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteOverview = Quote & {
  company_name: string | null;
  contact_name: string | null;
  event_title: string | null;
  total_ex_vat: number;
  total_vat: number;
  addons_ex_vat: number;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  group_id: string;
  article_id: string | null;
  description: string;
  line_date: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number;
  discount_pct: number;
  vat_rate: number;
  kind: "ingar" | "tillval";
  sort_order: number;
};

// Texter och format för det kunden ser (offertsidan och PDF:en) på svenska och engelska.
import { addDays, fmtDate, fmtDayMonth, fmtTime, isoToDate, weekday } from "@/lib/datum";

export type Lang = "sv" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "sv", label: "Svenska" },
  { id: "en", label: "Engelska" },
];

const STRINGS = {
  sv: {
    quote: "Offert",
    quoteNo: "Offert nr",
    no: "Nr",
    date: "Datum",
    to: "Till",
    validUntil: "Giltig till",
    expiredOn: "Gick ut",
    participants: "deltagare",
    rooms: "lokaler",
    kickerRooms: "Lokaler",
    titleRooms: "Där ni kommer att vara",
    kickerProgram: "Program",
    titleProgram: "Dag för dag",
    kickerPrice: "Pris",
    titlePrice: "Vad som ingår",
    kickerAddons: "Tillval",
    titleAddons: "Gör det ännu bättre",
    addonsNote: "Ingår inte i summan ovan. Säg till om ni vill lägga till något.",
    addonsPdf: "Möjliga tillval (ingår inte ovan)",
    addonsExVat: "Tillval exkl. moms",
    terms: "Villkor",
    sumBeforeDiscount: "Summa före rabatt",
    discount: "Rabatt",
    sumExVat: "Summa exkl. moms",
    vat: "Moms",
    toPay: "Att betala inkl. moms",
    totalInclVat: "Totalt inkl. moms",
    exVat: "exkl. moms",
    respond: "Svara på offerten",
    respondLead: "Godkänn direkt här, så bokar vi upp lokalerna och skickar bokningsavtalet.",
    downloadPdf: "Ladda ner PDF",
    yourContact: "Er kontakt hos oss",
    switchboard: "Växel",
    customer: "Kund",
    roomsAndTimes: "Lokaler och tider",
    yourRooms: "Era lokaler",
    sqm: "kvm",
    upTo: (n: string) => `upp till ${n} personer`,
    occasions: (n: number) => `${n} tillfälle${n === 1 ? "" : "n"}`,
    moreOccasions: (n: number) => `… och ${n} tillfällen till.`,
    desc: "Beskrivning",
    qty: "Antal",
    unitPrice: "À-pris",
    amount: "Belopp",
    name: "Ditt namn",
    email: "E-post",
    comment: "Kommentar (valfritt)",
    approveCheck: (who: string) => `Jag godkänner offerten och villkoren och har rätt att göra det för ${who}.`,
    onBehalfDefault: "vår räkning",
    accept: "Godkänn offerten",
    decline: "Avböj",
    accepted: (when: string, by: string) => `Offerten är godkänd ${when}${by ? ` av ${by}` : ""}. Tack! Vi återkommer med bokningsavtal och nästa steg.`,
    acceptedShort: (when: string, by: string) => `Godkänd ${when}${by ? ` av ${by}` : ""}.`,
    declined: "Offerten är avböjd.",
    expired: (who: string) => `Offertens giltighetstid har gått ut. Kontakta ${who} så hjälper vi dig.`,
    us: "oss",
    photosOf: (n: number, name: string) => `Visa ${n} bilder av ${name}`,
    msg: {
      accepterad: "Tack! Offerten är godkänd. Vi återkommer med bokningsavtal och nästa steg.",
      avbojd: "Tack för beskedet. Offerten är markerad som avböjd.",
      ogiltig: "Fyll i ditt namn och en giltig e-postadress.",
      godkann: "Kryssa i att du godkänner offerten och villkoren.",
      utgangen: "Offertens giltighetstid har gått ut. Kontakta oss så hjälper vi dig.",
      ej_tillganglig: "Offerten kan inte besvaras längre. Kontakta oss om du har frågor.",
      fel: "Något gick fel. Försök igen eller kontakta oss.",
    } as Record<string, string>,
    orgnr: "Org.nr",
    vatNo: "Momsreg.nr",
    bankgiro: "Bankgiro",
  },
  en: {
    quote: "Quote",
    quoteNo: "Quote no.",
    no: "No.",
    date: "Date",
    to: "For",
    validUntil: "Valid until",
    expiredOn: "Expired",
    participants: "guests",
    rooms: "rooms",
    kickerRooms: "Venue",
    titleRooms: "Where you will be",
    kickerProgram: "Schedule",
    titleProgram: "Day by day",
    kickerPrice: "Price",
    titlePrice: "What's included",
    kickerAddons: "Add-ons",
    titleAddons: "Make it even better",
    addonsNote: "Not included in the total above. Let us know if you would like to add anything.",
    addonsPdf: "Optional add-ons (not included above)",
    addonsExVat: "Add-ons excl. VAT",
    terms: "Terms and conditions",
    sumBeforeDiscount: "Subtotal before discount",
    discount: "Discount",
    sumExVat: "Total excl. VAT",
    vat: "VAT",
    toPay: "Total incl. VAT",
    totalInclVat: "Total incl. VAT",
    exVat: "excl. VAT",
    respond: "Respond to the quote",
    respondLead: "Accept it right here and we will reserve the rooms and send you the booking agreement.",
    downloadPdf: "Download PDF",
    yourContact: "Your contact",
    switchboard: "Phone",
    customer: "Customer",
    roomsAndTimes: "Rooms and times",
    yourRooms: "Your rooms",
    sqm: "sq m",
    upTo: (n: string) => `up to ${n} guests`,
    occasions: (n: number) => `${n} booking${n === 1 ? "" : "s"}`,
    moreOccasions: (n: number) => `… and ${n} more.`,
    desc: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    name: "Your name",
    email: "Email",
    comment: "Comment (optional)",
    approveCheck: (who: string) => `I accept the quote and the terms, and I am authorised to do so on behalf of ${who}.`,
    onBehalfDefault: "our organisation",
    accept: "Accept the quote",
    decline: "Decline",
    accepted: (when: string, by: string) => `The quote was accepted ${when}${by ? ` by ${by}` : ""}. Thank you! We will be in touch with the booking agreement and next steps.`,
    acceptedShort: (when: string, by: string) => `Accepted ${when}${by ? ` by ${by}` : ""}.`,
    declined: "The quote has been declined.",
    expired: (who: string) => `This quote has expired. Please contact ${who} and we will help you.`,
    us: "us",
    photosOf: (n: number, name: string) => `Show ${n} photos of ${name}`,
    msg: {
      accepterad: "Thank you! The quote is accepted. We will be in touch with the booking agreement and next steps.",
      avbojd: "Thank you for letting us know. The quote has been marked as declined.",
      ogiltig: "Please enter your name and a valid email address.",
      godkann: "Please tick the box to accept the quote and the terms.",
      utgangen: "This quote has expired. Please contact us and we will help you.",
      ej_tillganglig: "This quote can no longer be answered. Please contact us if you have any questions.",
      fel: "Something went wrong. Please try again or contact us.",
    } as Record<string, string>,
    orgnr: "Reg. no.",
    vatNo: "VAT no.",
    bankgiro: "Bankgiro",
  },
};

export type Strings = (typeof STRINGS)["sv"];
export const strings = (lang: Lang): Strings => STRINGS[lang] as Strings;

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SV = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

const toDate = (d: string) => (d.length > 10 ? isoToDate(d) : d);

/** "1 mar" / "1 Mar" */
export function dayMonth(date: string, lang: Lang) {
  const d = toDate(date);
  if (lang === "sv") return fmtDayMonth(d);
  return `${Number(d.slice(8, 10))} ${MONTHS_EN[Number(d.slice(5, 7)) - 1]}`;
}

/** "mån 1 mar 2027" / "Mon 1 Mar 2027" */
export function longDate(date: string, lang: Lang) {
  const d = toDate(date);
  if (lang === "sv") return fmtDate(d);
  return `${DAYS_EN[weekday(d)].slice(0, 3)} ${dayMonth(d, "en")} ${d.slice(0, 4)}`;
}

export const weekdayName = (date: string, lang: Lang) => (lang === "en" ? DAYS_EN : DAYS_SV)[weekday(toDate(date))];

/** "07:00–23:00" eller med slutdag om bokningen går över midnatt. */
export function timeSpan(startIso: string, endIso: string, lang: Lang) {
  const d = isoToDate(startIso);
  const ed = isoToDate(endIso);
  const end = fmtTime(endIso) === "00:00" && addDays(d, 1) === ed ? "24:00" : fmtTime(endIso);
  return ed === d || end === "24:00" ? `${fmtTime(startIso)}–${end}` : `${fmtTime(startIso)} – ${dayMonth(ed, lang)} ${end}`;
}

/** "1 mar – 3 mar 2027" för en hel period. */
export function period(first: string, last: string, lang: Lang) {
  if (first === last) return longDate(first, lang);
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${dayMonth(first, lang)} – ${dayMonth(last, lang)} ${last.slice(0, 4)}`
    : `${longDate(first, lang)} – ${longDate(last, lang)}`;
}

const SEK_SV = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const SEK_EN = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "12 500 kr" / "SEK 12,500" */
export function money(n: number | null | undefined, lang: Lang) {
  if (n == null || Number.isNaN(n)) return "–";
  return lang === "en" ? `SEK ${SEK_EN.format(n)}` : `${SEK_SV.format(n)} kr`;
}

export const num = (n: number, lang: Lang) => n.toLocaleString(lang === "en" ? "en-GB" : "sv-SE");

const UNITS_EN: Record<string, [string, string]> = {
  st: ["pc", "pcs"],
  dag: ["day", "days"],
  tim: ["hour", "hours"],
  h: ["hour", "hours"],
  timme: ["hour", "hours"],
  person: ["person", "people"],
  pers: ["person", "people"],
  "per person": ["per person", "per person"],
  paket: ["package", "packages"],
  m2: ["sq m", "sq m"],
  event: ["event", "events"],
  kväll: ["evening", "evenings"],
};

/** Enheten på offertens språk. */
export function unitLabel(unit: string, quantity: number, lang: Lang) {
  if (lang === "sv") return unit;
  const u = UNITS_EN[unit.trim().toLowerCase()];
  return u ? u[quantity === 1 ? 0 : 1] : unit;
}

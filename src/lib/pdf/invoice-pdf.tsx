import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { addressLine, type Company } from "@/lib/foretag";
import { invoiceTotals, lineAmount, INVOICE_KIND_LABEL, type InvoiceKind } from "@/lib/faktura";

const MUTED = "#7a6466";
const LINE = "#e4d9d7";
const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

export type InvoicePdfData = {
  number: number; kind: InvoiceKind; percent: number | null; invoice_date: string; due_days: number;
  customer_reference: string | null; our_reference: string | null; note: string | null;
  recipient: { name?: string; org_nr?: string; address?: string; postal_code?: string; city?: string; invoice_email?: string; invoice_address?: string; invoice_reference?: string };
  event: { title: string; dates: string };
  quotes: string[];
  lines: { description: string; quantity: number; unit: string | null; unit_price: number; vat_rate: number }[];
  attachments: string[];
  company: Company;
  accent: string;
};

function InvoicePdf({ d }: { d: InvoicePdfData }) {
  const s = StyleSheet.create({
    page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#2a1c1d", lineHeight: 1.35 },
    band: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: d.accent },
    head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
    brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: d.accent },
    docType: { fontSize: 18, fontFamily: "Helvetica-Bold", color: d.accent, textAlign: "right" },
    meta: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 2 },
    row: { flexDirection: "row", gap: 24, marginBottom: 14 },
    col: { flexGrow: 1, flexBasis: 0 },
    label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
    th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: d.accent, paddingBottom: 3, fontSize: 7.5, color: MUTED, textTransform: "uppercase" },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3.5 },
    cDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
    cQty: { width: 60, textAlign: "right" },
    cPrice: { width: 72, textAlign: "right" },
    cVat: { width: 40, textAlign: "right" },
    cSum: { width: 80, textAlign: "right" },
    sumRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 2 },
    sumLabel: { width: 180, textAlign: "right", paddingRight: 10, color: MUTED },
    sumVal: { width: 90, textAlign: "right" },
    total: { fontFamily: "Helvetica-Bold", fontSize: 11 },
    note: { marginTop: 16, padding: 8, backgroundColor: "#f6efee", fontSize: 9 },
    footer: { position: "absolute", bottom: 18, left: 44, right: 44, fontSize: 7, color: MUTED },
  });
  const t = invoiceTotals(d.lines);
  const r = d.recipient;
  return (
    <Document title={`Fakturaunderlag ${d.number}`} author={d.company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.band} fixed />
        <View style={s.head}>
          <View>
            <Text style={s.brand}>{d.company.name}</Text>
            <Text style={{ fontSize: 8.5, color: MUTED }}>{addressLine(d.company)}</Text>
          </View>
          <View>
            <Text style={s.docType}>Fakturaunderlag {d.number}</Text>
            <Text style={s.meta}>{INVOICE_KIND_LABEL[d.kind]}{d.kind === "del" && d.percent != null ? ` (${d.percent} %)` : ""}</Text>
            <Text style={s.meta}>Fakturadatum {d.invoice_date} · {d.due_days} dagar netto</Text>
          </View>
        </View>
        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Kund</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{r.name ?? "–"}</Text>
            {r.org_nr && <Text>Org.nr {r.org_nr}</Text>}
            {r.invoice_address ? <Text>{r.invoice_address}</Text> : <Text>{[r.address, [r.postal_code, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</Text>}
            {r.invoice_email && <Text>Faktura till: {r.invoice_email}</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Evenemang</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.event.title}</Text>
            <Text>{d.event.dates}</Text>
            {d.quotes.length > 0 && <Text style={{ color: MUTED }}>Underlag: {d.quotes.join(", ")}</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Referenser</Text>
            <Text>Er referens: {d.customer_reference || r.invoice_reference || "–"}</Text>
            <Text>Vår referens: {d.our_reference || "–"}</Text>
          </View>
        </View>
        <View style={s.th}>
          <Text style={s.cDesc}>Beskrivning</Text><Text style={s.cQty}>Antal</Text><Text style={s.cPrice}>À-pris</Text><Text style={s.cVat}>Moms</Text><Text style={s.cSum}>Belopp</Text>
        </View>
        {d.lines.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>{Number(l.quantity).toLocaleString("sv-SE")} {l.unit ?? ""}</Text>
            <Text style={s.cPrice}>{kr(Number(l.unit_price))}</Text>
            <Text style={s.cVat}>{Number(l.vat_rate)} %</Text>
            <Text style={s.cSum}>{kr(lineAmount(l))}</Text>
          </View>
        ))}
        <View style={{ marginTop: 8 }}>
          <View style={s.sumRow}><Text style={s.sumLabel}>Summa exkl. moms</Text><Text style={s.sumVal}>{kr(t.net)}</Text></View>
          {t.byVat.map(([v, x]) => (
            <View key={v} style={s.sumRow}><Text style={s.sumLabel}>Moms {v} % (på {kr(x.base)})</Text><Text style={s.sumVal}>{kr(x.vat)}</Text></View>
          ))}
          <View style={s.sumRow}><Text style={[s.sumLabel, s.total]}>Att fakturera</Text><Text style={[s.sumVal, s.total]}>{kr(t.total)}</Text></View>
        </View>
        {d.note && <View style={s.note}><Text style={s.label}>Till ekonomi</Text><Text>{d.note}</Text></View>}
        {d.attachments.length > 0 && <Text style={{ marginTop: 10, fontSize: 8.5, color: MUTED }}>Bilagor: {d.attachments.join(", ")}</Text>}
        <Text style={s.footer} fixed>{[d.company.legal_name, d.company.orgnr && `Org.nr ${d.company.orgnr}`, d.company.email].filter(Boolean).join(" · ")}</Text>
      </Page>
    </Document>
  );
}

export const renderInvoicePdf = (d: InvoicePdfData) => renderToBuffer(<InvoicePdf d={d} />);

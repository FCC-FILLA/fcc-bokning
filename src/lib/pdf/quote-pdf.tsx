import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtDate, fmtRange } from "@/lib/datum";
import { fmtKr, lineTotal, quoteTotals } from "@/lib/offert";
import { groupLines, type QuoteDoc } from "@/lib/offert-doc";

// PDF för en offert. Inbyggt typsnitt (Helvetica) som klarar å, ä och ö.
const BRAND = "#60272B";
const MUTED = "#7a6466";
const LINE = "#e4d9d7";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, fontFamily: "Helvetica", color: "#2a1c1d", lineHeight: 1.35 },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 8, backgroundColor: BRAND },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: 0.4 },
  brandSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  docType: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND, textAlign: "right", lineHeight: 1, marginBottom: 6 },
  meta: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 2 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  infoRow: { flexDirection: "row", gap: 24, marginBottom: 14 },
  infoCol: { flexGrow: 1, flexBasis: 0 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  para: { marginBottom: 12 },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: BRAND, marginTop: 10, marginBottom: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3.5 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BRAND, paddingBottom: 3, fontSize: 7.5, color: MUTED, textTransform: "uppercase" },
  cDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
  cDate: { width: 62 },
  cQty: { width: 50, textAlign: "right" },
  cPrice: { width: 66, textAlign: "right" },
  cDisc: { width: 40, textAlign: "right" },
  cSum: { width: 72, textAlign: "right" },
  sumRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 2 },
  sumLabel: { width: 160, textAlign: "right", paddingRight: 10, color: MUTED },
  sumVal: { width: 90, textAlign: "right" },
  total: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  terms: { fontSize: 8, color: "#4a3a3b", marginTop: 4 },
  footerLeft: { position: "absolute", bottom: 24, left: 44, fontSize: 7.5, color: MUTED },
});

const shortDate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : "");

function QuotePdf({ doc }: { doc: QuoteDoc }) {
  const t = quoteTotals(doc.lines);
  const included = groupLines(doc.lines.filter((l) => l.kind === "ingar"));
  const addons = doc.lines.filter((l) => l.kind === "tillval");
  const header = (
    <View style={s.th} fixed>
      <Text style={s.cDesc}>Beskrivning</Text>
      <Text style={s.cDate}>Datum</Text>
      <Text style={s.cQty}>Antal</Text>
      <Text style={s.cPrice}>À-pris</Text>
      <Text style={s.cDisc}>Rabatt</Text>
      <Text style={s.cSum}>Belopp</Text>
    </View>
  );
  const row = (l: QuoteDoc["lines"][number], i: number) => (
    <View style={s.tr} key={i} wrap={false}>
      <Text style={s.cDesc}>{l.description}</Text>
      <Text style={s.cDate}>{shortDate(l.line_date)}</Text>
      <Text style={s.cQty}>{`${l.quantity.toLocaleString("sv-SE")} ${l.unit}`}</Text>
      <Text style={s.cPrice}>{fmtKr(l.unit_price)}</Text>
      <Text style={s.cDisc}>{l.discount_pct ? `${l.discount_pct} %` : ""}</Text>
      <Text style={s.cSum}>{fmtKr(lineTotal(l))}</Text>
    </View>
  );

  return (
    <Document title={`Offert ${doc.number} – ${doc.title}`} author="Filadelfia Convention Center" language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.band} fixed />
        <View style={s.head}>
          <View>
            <Text style={s.brand}>FILADELFIA CONVENTION CENTER</Text>
            <Text style={s.brandSub}>Rörstrandsgatan 5, Stockholm</Text>
          </View>
          <View>
            <Text style={s.docType}>Offert</Text>
            <Text style={s.meta}>Nr {doc.number}</Text>
            {doc.sent_at && <Text style={s.meta}>Datum {fmtDate(doc.sent_at)}</Text>}
            {doc.valid_until && <Text style={s.meta}>Giltig till {fmtDate(doc.valid_until)}</Text>}
          </View>
        </View>

        <Text style={s.title}>{doc.title}</Text>
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.label}>Kund</Text>
            <Text>{doc.company_name ?? "–"}</Text>
            {doc.contact_name && <Text>{doc.contact_name}</Text>}
          </View>
          <View style={s.infoCol}>
            <Text style={s.label}>Er kontakt hos oss</Text>
            <Text>{doc.salesperson_name || "–"}</Text>
            {doc.salesperson_email && <Text>{doc.salesperson_email}</Text>}
          </View>
        </View>

        {doc.intro && <Text style={s.para}>{doc.intro}</Text>}

        {doc.bookings.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={s.h2}>Lokaler och tider</Text>
            {doc.bookings.slice(0, 40).map((b, i) => (
              <View style={s.tr} key={i} wrap={false}>
                <Text style={{ width: 170 }}>{b.room}</Text>
                <Text>{fmtRange(b.starts_at, b.ends_at)}</Text>
              </View>
            ))}
            {doc.bookings.length > 40 && <Text style={{ color: MUTED, marginTop: 3 }}>{`… och ${doc.bookings.length - 40} tillfällen till.`}</Text>}
          </View>
        )}

        {[...included].map(([group, lines]) => (
          <View key={group} wrap>
            <Text style={s.h2}>{group}</Text>
            {header}
            {lines.map(row)}
          </View>
        ))}

        <View style={{ marginTop: 10 }} wrap={false}>
          {t.discount > 0 && (
            <>
              <View style={s.sumRow}><Text style={s.sumLabel}>Summa före rabatt</Text><Text style={s.sumVal}>{fmtKr(t.beforeDiscount)}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Rabatt</Text><Text style={s.sumVal}>{`−${fmtKr(t.discount)}`}</Text></View>
            </>
          )}
          <View style={s.sumRow}><Text style={s.sumLabel}>Summa exkl. moms</Text><Text style={s.sumVal}>{fmtKr(t.exVat)}</Text></View>
          <View style={s.sumRow}><Text style={s.sumLabel}>Moms</Text><Text style={s.sumVal}>{fmtKr(t.vat)}</Text></View>
          <View style={[s.sumRow, { borderTopWidth: 1, borderTopColor: BRAND, marginTop: 2, paddingTop: 4 }]}>
            <Text style={[s.sumLabel, s.total, { color: "#2a1c1d" }]}>Att betala inkl. moms</Text>
            <Text style={[s.sumVal, s.total]}>{fmtKr(t.inclVat)}</Text>
          </View>
        </View>

        {addons.length > 0 && (
          <View wrap>
            <Text style={s.h2}>Möjliga tillval (ingår inte ovan)</Text>
            {header}
            {addons.map(row)}
            <View style={s.sumRow}><Text style={s.sumLabel}>Tillval exkl. moms</Text><Text style={s.sumVal}>{fmtKr(t.addonsExVat)}</Text></View>
          </View>
        )}

        {doc.terms && (
          <View wrap>
            <Text style={s.h2}>Villkor</Text>
            <Text style={s.terms}>{doc.terms}</Text>
          </View>
        )}

        {doc.status === "accepterad" && doc.accepted_at && (
          <Text style={[s.para, { marginTop: 12, color: "#2f6b45" }]}>
            {`Godkänd ${fmtDate(doc.accepted_at)}${doc.accepted_name ? ` av ${doc.accepted_name}` : ""}.`}
          </Text>
        )}

        <Text style={s.footerLeft} fixed>{`Offert ${doc.number} · Filadelfia Convention Center AB · Rörstrandsgatan 5, Stockholm`}</Text>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(doc: QuoteDoc) {
  return renderToBuffer(<QuotePdf doc={doc} />);
}

export function pdfFileName(doc: QuoteDoc) {
  const safe = doc.title.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `Offert-${doc.number}${safe ? `-${safe}` : ""}.pdf`;
}

/* eslint-disable jsx-a11y/alt-text -- react-pdf:s Image har ingen alt-text */
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { addressLine, footerParts } from "@/lib/foretag";
import { iconPaths } from "@/lib/ikoner";
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
  cThumb: { width: 34, paddingRight: 8 },
  thumb: { width: 26, height: 26, objectFit: "cover", borderRadius: 2 },
  lineText: { fontSize: 7.5, color: MUTED, marginTop: 1 },
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
  hero: { height: 150, marginHorizontal: -44, marginBottom: 18, objectFit: "cover" },
  roomCard: { flexDirection: "row", gap: 10, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
  roomImg: { width: 96, height: 64, objectFit: "cover", borderRadius: 2 },
  roomName: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  roomFacts: { fontSize: 8, color: MUTED, marginBottom: 2 },
  footerLeft: { position: "absolute", bottom: 18, left: 44, right: 44, fontSize: 7, color: MUTED, lineHeight: 1.4 },
});

const shortDate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : "");

/** Bilder hämtade i förväg, nyckel = sökväg som i doc.rooms[].image. */
export type PdfImages = Map<string, Buffer>;

function QuotePdf({ doc, images }: { doc: QuoteDoc; images: PdfImages }) {
  const cover = doc.rooms.map((r) => r.image).find((i): i is string => !!i && images.has(i));
  const t = quoteTotals(doc.lines);
  const included = groupLines(doc.lines.filter((l) => l.kind === "ingar"));
  const addons = doc.lines.filter((l) => l.kind === "tillval");
  const header = (
    <View style={s.th} fixed>
      <Text style={s.cThumb} />
      <Text style={s.cDesc}>Beskrivning</Text>
      <Text style={s.cDate}>Datum</Text>
      <Text style={s.cQty}>Antal</Text>
      <Text style={s.cPrice}>À-pris</Text>
      <Text style={s.cDisc}>Rabatt</Text>
      <Text style={s.cSum}>Belopp</Text>
    </View>
  );
  const row = (l: QuoteDoc["lines"][number], i: number) => (
    <View style={[s.tr, { alignItems: "center" }]} key={i} wrap={false}>
      <View style={s.cThumb}>
        {l.image && images.has(l.image) ? (
          <Image style={s.thumb} src={images.get(l.image)!} />
        ) : (
          <Svg viewBox="0 0 48 48" width={22} height={22}>
            {iconPaths(l.icon).map((d, k) => (
              <Path key={k} d={d} fill="none" stroke={BRAND} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        )}
      </View>
      <View style={s.cDesc}>
        <Text>{l.description}</Text>
        {l.text && <Text style={s.lineText}>{l.text}</Text>}
      </View>
      <Text style={s.cDate}>{shortDate(l.line_date)}</Text>
      <Text style={s.cQty}>{`${l.quantity.toLocaleString("sv-SE")} ${l.unit}`}</Text>
      <Text style={s.cPrice}>{fmtKr(l.unit_price)}</Text>
      <Text style={s.cDisc}>{l.discount_pct ? `${l.discount_pct} %` : ""}</Text>
      <Text style={s.cSum}>{fmtKr(lineTotal(l))}</Text>
    </View>
  );

  return (
    <Document title={`Offert ${doc.number} – ${doc.title}`} author={doc.company.name} language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.band} fixed />
        <View style={s.head}>
          <View>
            <Text style={s.brand}>{doc.company.name.toUpperCase()}</Text>
            <Text style={s.brandSub}>{addressLine(doc.company)}</Text>
          </View>
          <View>
            <Text style={s.docType}>Offert</Text>
            <Text style={s.meta}>Nr {doc.number}</Text>
            {doc.sent_at && <Text style={s.meta}>Datum {fmtDate(doc.sent_at)}</Text>}
            {doc.valid_until && <Text style={s.meta}>Giltig till {fmtDate(doc.valid_until)}</Text>}
          </View>
        </View>

        {cover && <Image style={s.hero} src={images.get(cover)!} />}

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

        {doc.rooms.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={s.h2}>Era lokaler</Text>
            {doc.rooms.map((r, i) => (
              <View style={s.roomCard} key={i} wrap={false}>
                {r.image && images.has(r.image) && <Image style={s.roomImg} src={images.get(r.image)!} />}
                <View style={{ flexGrow: 1, flexBasis: 0 }}>
                  <Text style={s.roomName}>{r.name}</Text>
                  <Text style={s.roomFacts}>{[r.kvm ? `${r.kvm} kvm` : null, r.max ? `upp till ${r.max} personer` : null].filter(Boolean).join(" · ")}</Text>
                  {r.text && <Text style={{ fontSize: 8.5 }}>{r.text}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

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
            <Text style={s.h2} minPresenceAhead={60}>{group}</Text>
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
            <Text style={s.h2} minPresenceAhead={60}>Möjliga tillval (ingår inte ovan)</Text>
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

        <View style={s.footerLeft} fixed>
          {footerParts(doc.company).map((row, i) => (
            <Text key={i}>{(i === 0 ? [`Offert ${doc.number}`, ...row] : row).join(" · ")}</Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(doc: QuoteDoc, images: PdfImages = new Map()) {
  return renderToBuffer(<QuotePdf doc={doc} images={images} />);
}

const okImage = (p: string | null): p is string =>
  !!p && (p.startsWith("/lokaler/") || /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//.test(p));

/** Hämtar lokal- och artikelbilder. Lokala sökvägar via sajtens egen adress. Misslyckas en bild hoppar vi bara över den. */
export async function fetchPdfImages(doc: QuoteDoc, origin: string): Promise<PdfImages> {
  const paths = [...new Set([...doc.rooms.map((r) => r.image), ...doc.lines.map((l) => l.image)].filter(okImage))].slice(0, 24);
  const out: PdfImages = new Map();
  await Promise.all(
    paths.map(async (p) => {
      try {
        const res = await fetch(new URL(p, origin), { signal: AbortSignal.timeout(4000) });
        if (res.ok) out.set(p, Buffer.from(await res.arrayBuffer()));
      } catch {
        /* utan bild */
      }
    }),
  );
  return out;
}

export function pdfFileName(doc: QuoteDoc) {
  const safe = doc.title.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `Offert-${doc.number}${safe ? `-${safe}` : ""}.pdf`;
}

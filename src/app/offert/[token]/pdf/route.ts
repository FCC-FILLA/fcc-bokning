import { NextResponse } from "next/server";
import { loadPublicDoc } from "@/lib/offert-doc";
import { fetchPdfImages, pdfFileName, renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// PDF för kunden via delningslänken.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await loadPublicDoc(await createClient(), token);
  if (!doc) return new NextResponse("Offerten finns inte eller är inte längre tillgänglig.", { status: 404 });
  const pdf = await renderQuotePdf(doc, await fetchPdfImages(doc, new URL(req.url).origin));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(doc)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

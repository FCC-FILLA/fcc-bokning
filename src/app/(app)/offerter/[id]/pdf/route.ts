import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { loadInternalDoc } from "@/lib/offert-doc";
import { fetchPdfImages, pdfFileName, renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// PDF för inloggad personal, även för utkast.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProfile())) return new NextResponse("Logga in för att se offerten.", { status: 401 });
  const doc = await loadInternalDoc(await createClient(), id);
  if (!doc) return new NextResponse("Offerten finns inte.", { status: 404 });
  const pdf = await renderQuotePdf(doc, await fetchPdfImages(doc, new URL(req.url).origin));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(doc)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

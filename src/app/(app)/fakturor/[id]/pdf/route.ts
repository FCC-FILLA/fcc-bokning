import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { loadInvoicePdfData } from "@/lib/faktura-doc";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProfile())) return new NextResponse("Logga in.", { status: 401 });
  const d = await loadInvoicePdfData(await createClient(), id);
  if (!d) return new NextResponse("Underlaget finns inte.", { status: 404 });
  const pdf = await renderInvoicePdf(d);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Fakturaunderlag-${d.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}

import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/dokument";

// Dokument för inloggad personal på ett evenemang de är bokade på.
export async function GET(_req: Request, { params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  return signedDocumentUrl(await createClient(), "document_for_staff", { p_doc: doc });
}

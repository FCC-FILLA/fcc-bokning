import { createClient } from "@/lib/supabase/server";
import { signedDocumentUrl } from "@/lib/dokument";

// Publikt dokument på kundens eventsida.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; doc: string }> }) {
  const { token, doc } = await params;
  return signedDocumentUrl(await createClient(), "document_for_link", { p_token: token, p_doc: doc });
}

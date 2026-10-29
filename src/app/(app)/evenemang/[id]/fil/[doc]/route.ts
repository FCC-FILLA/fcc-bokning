import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Öppnar ett dokument på evenemanget (inloggad personal med läsrätt).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!(await getProfile())) return new NextResponse("Logga in.", { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase.from("event_documents").select("storage_path, name").eq("id", doc).eq("event_id", id).maybeSingle();
  if (!data?.storage_path) return new NextResponse("Dokumentet finns inte.", { status: 404 });
  const { data: signed } = await supabase.storage.from("dokument").createSignedUrl(data.storage_path, 120, { download: data.name });
  if (!signed) return new NextResponse("Dokumentet gick inte att öppna.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}

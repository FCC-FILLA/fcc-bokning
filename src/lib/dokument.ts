import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f-]{36}$/i;

/** Kontrollerar behörigheten via en databasfunktion och skickar vidare till en kortlivad länk. */
export async function signedDocumentUrl(supabase: SupabaseClient, fn: "document_for_link" | "document_for_staff", args: Record<string, string>) {
  if (!Object.values(args).every((v) => UUID.test(v))) return new NextResponse("Dokumentet finns inte.", { status: 404 });
  const { data: path } = await supabase.rpc(fn, args);
  if (typeof path !== "string" || !path) return new NextResponse("Dokumentet finns inte.", { status: 404 });
  const name = path.split("/").pop()!.replace(/^[0-9a-f-]{36}-/i, "");
  const { data: signed } = await supabase.storage.from("dokument").createSignedUrl(path, 120, { download: name });
  if (!signed) return new NextResponse("Dokumentet gick inte att öppna.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}

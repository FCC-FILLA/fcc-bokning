import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadPublicDoc } from "@/lib/offert-doc";
import { strings } from "@/lib/sprak";
import { createClient } from "@/lib/supabase/server";
import { QuoteView } from "@/components/quote-view";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const doc = await loadPublicDoc(await createClient(), token);
  return { title: doc ? `${strings(doc.language).quote} ${doc.number}` : "Offert", robots: { index: false, follow: false } };
}

async function respond(token: string, fd: FormData) {
  "use server";
  const accept = fd.get("answer") === "accept";
  if (accept && fd.get("approve") !== "on") redirect(`/offert/${token}?svar=godkann#svara`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("respond_to_quote", {
    p_token: token,
    p_accept: accept,
    p_name: String(fd.get("name") ?? ""),
    p_email: String(fd.get("email") ?? ""),
    p_comment: String(fd.get("comment") ?? ""),
  });
  redirect(`/offert/${token}?svar=${data ?? "fel"}#svara`);
}

const OK_ANSWERS = new Set(["accepterad", "avbojd"]);

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ svar?: string }>;
}) {
  const { token } = await params;
  const { svar } = await searchParams;
  const doc = await loadPublicDoc(await createClient(), token);
  if (!doc) notFound();
  const s = strings(doc.language);
  const message = svar && s.msg[svar] ? { ok: OK_ANSWERS.has(svar), text: s.msg[svar] } : null;
  return <QuoteView doc={doc} pdfHref={`/offert/${token}/pdf`} respond={respond.bind(null, token)} message={message} />;
}

import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Skylt" };

/** QR-skylt att skriva ut och sätta upp i lokalen (A5/A4 stående). */
export default async function RoomSign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const [{ data: room }, { data: site }] = await Promise.all([
    supabase.from("rooms").select("name, card_token").eq("id", id).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "site_url").maybeSingle(),
  ]);
  if (!room) notFound();
  const url = `${site?.value || "https://fcc-bokning.vercel.app"}/lokal/${room.card_token}`;
  const qr = await qrSvg(url);
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-5 bg-white p-8 text-center print:p-0">
      <div className="print:hidden"><PrintButton /></div>
      <p className="label tracking-[0.2em]">Filadelfia Convention Center</p>
      <h1 className="font-display text-4xl font-semibold">{room.name}</h1>
      <div className="w-72 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="text-lg">Skanna för info om lokalen<br />och för att anmäla fel.</p>
      <p className="text-sm text-muted">Ljus och ljud · nödutgångar · vem du ringer</p>
    </div>
  );
}

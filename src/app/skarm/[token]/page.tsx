import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ScreenFeed } from "@/lib/skarm";
import { Board } from "./board";
import "../skarm.css";

// Kontorsskärm: /skarm/<hemlig nyckel>. Öppen utan inloggning, nyckeln byts under Skärmar → Kontorsskärm.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kontorsskärm", robots: { index: false, follow: false } };

export default async function ScreenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("screen_feed", { p_token: token });
  if (error) throw new Error("Bokningarna kunde inte hämtas.");
  if (!data) notFound();

  return <Board feed={data as ScreenFeed} />;
}

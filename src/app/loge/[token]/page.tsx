import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseLang, type LogeFeed } from "@/lib/loge";
import { LogeBoard } from "./board";
import "../loge.css";

// Logeskärm: /loge/<hemlig nyckel>?sprak=sv|en|vaxla. Öppen utan inloggning, nyckeln byts under Skärmar → Logeskärm.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Loge", robots: { index: false, follow: false } };

export default async function LogePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sprak?: string | string[] }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loge_feed", { p_token: token });
  if (error) throw new Error("Schemat kunde inte hämtas.");
  if (!data) notFound();

  return <LogeBoard feed={data as LogeFeed} mode={parseLang(sp.sprak)} />;
}

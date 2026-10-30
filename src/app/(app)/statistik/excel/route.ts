import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import type { Stats } from "@/lib/statistik";
import { buildStatsWorkbook } from "@/lib/statistik-excel";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await getProfile())) return new NextResponse("Logga in.", { status: 401 });
  const year = Number(new URL(req.url).searchParams.get("ar")) || new Date().getFullYear();
  const { data, error } = await (await createClient()).rpc("stats_year", { p_year: year });
  if (error || !data) return new NextResponse("Statistiken gick inte att hämta.", { status: 500 });
  const buf = await buildStatsWorkbook(data as Stats);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="FCC-statistik-${year}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

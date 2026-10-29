import { NextResponse } from "next/server";
import { canManageStaff, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildMonthWorkbook } from "@/lib/tid-excel";

export const runtime = "nodejs";

// Tidsunderlag för en månad som Excel.
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!canManageStaff(profile)) return new NextResponse("Ingen behörighet.", { status: 403 });
  const month = new URL(req.url).searchParams.get("manad") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Ange månad.", { status: 400 });
  const supabase = await createClient();
  const { buffer, locked } = await buildMonthWorkbook(supabase, month);
  if (locked) await supabase.from("time_periods").update({ exported_at: new Date().toISOString() }).eq("month", `${month}-01`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Tidsunderlag-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

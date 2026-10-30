import { NextResponse } from "next/server";
import { canManageStaff, getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildPayrollWorkbook } from "@/lib/tid-excel";

export const runtime = "nodejs";

// Löneunderlag för en månad i lönesystemets importformat.
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!canManageStaff(profile)) return new NextResponse("Ingen behörighet.", { status: 403 });
  const month = new URL(req.url).searchParams.get("manad") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("Ange månad.", { status: 400 });
  const supabase = await createClient();
  const { buffer, locked } = await buildPayrollWorkbook(supabase, month);
  if (locked) await supabase.from("time_periods").update({ exported_at: new Date().toISOString() }).eq("month", `${month}-01`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Loneunderlag-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

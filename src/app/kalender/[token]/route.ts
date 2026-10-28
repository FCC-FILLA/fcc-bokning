import { NextResponse } from "next/server";
import { buildCalendar } from "@/lib/ical";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type EventStatus } from "@/lib/types";

// Personlig kalenderprenumeration: /kalender/<hemlig nyckel>
// Outlook, Google och iPhone hämtar filen själva med jämna mellanrum.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse("Ogiltig länk.", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) return new NextResponse("Kalendern kunde inte hämtas.", { status: 500 });
  const rows = (data ?? []) as {
    booking_id: string; event_id: string; title: string; status: EventStatus; room: string;
    starts_at: string; ends_at: string; note: string | null; company: string | null; updated_at: string;
  }[];
  if (!rows.length) {
    // Ogiltig nyckel och tom kalender ser likadana ut utåt.
    return new NextResponse(buildCalendar("FCC Bokning", []), { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
  }

  const origin = new URL(req.url).origin;
  const ics = buildCalendar(
    "FCC Bokning",
    rows.map((r) => ({
      uid: `${r.booking_id}@fcc-bokning`,
      start: r.starts_at,
      end: r.ends_at,
      summary: `${r.status === "bekraftad" ? "" : `(${STATUS_LABEL[r.status]}) `}${r.title}`,
      location: r.room,
      description: [r.company, r.note].filter(Boolean).join("\n") || null,
      status: r.status === "bekraftad" ? "CONFIRMED" : "TENTATIVE",
      url: `${origin}/evenemang/${r.event_id}`,
      updated: r.updated_at,
    })),
  );
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="fcc-bokning.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}

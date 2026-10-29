import "server-only";
import { after } from "next/server";
import { createClient as createPlain } from "@supabase/supabase-js";
import webpush from "web-push";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SECRET = process.env.PUSH_CLAIM_SECRET;
const SUBJECT = process.env.VAPID_SUBJECT ?? "https://fcc-bokning.vercel.app";
const enabled = !!(PUBLIC && PRIVATE && SECRET);
if (enabled) webpush.setVapidDetails(SUBJECT, PUBLIC!, PRIVATE!);

/**
 * Skickar appnotiser för nya notiser (skapade i databasen av kundens eller personalens åtgärder).
 * Körs efter att svaret skickats, så att det aldrig gör sidan långsammare. Misslyckas tyst.
 */
export function deliverNotifications() {
  if (!enabled) return;
  after(async () => {
    try {
      const db = createPlain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const { data } = await db.rpc("claim_pushes", { p_secret: SECRET });
      const rows = (data ?? []) as { id: string; title: string; body: string | null; link: string | null; endpoint: string; p256dh: string; auth: string }[];
      await Promise.allSettled(
        rows.map((r) =>
          webpush.sendNotification(
            { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
            JSON.stringify({ title: r.title, body: r.body ?? "", url: r.link ?? "/notiser", tag: r.id }),
            { TTL: 86_400 },
          ),
        ),
      );
    } catch {
      // tyst
    }
  });
}

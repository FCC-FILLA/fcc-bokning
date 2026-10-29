import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtDate, fmtTime } from "@/lib/datum";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "https://fcc-bokning.vercel.app";
const enabled = !!(PUBLIC && PRIVATE);
if (enabled) webpush.setVapidDetails(SUBJECT, PUBLIC!, PRIVATE!);

/**
 * Skickar en appnotis till personer (staff-id) och/eller alla internpersonal med en funktion.
 * Misslyckas tyst: notiser får aldrig stoppa själva åtgärden.
 */
export async function notify(supabase: SupabaseClient, target: { staff?: string[]; functionId?: string }, msg: PushMessage) {
  if (!enabled) return 0;
  try {
    const { data } = await supabase.rpc("push_targets", { p_staff: target.staff ?? [], p_function: target.functionId ?? null });
    const subs = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/portal", tag: msg.tag });
    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400 })),
    );
    await Promise.all(
      results.map((r, i) =>
        r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)
          ? supabase.rpc("push_forget", { p_endpoint: subs[i].endpoint })
          : null,
      ),
    );
    return results.filter((r) => r.status === "fulfilled").length;
  } catch {
    return 0;
  }
}

/** "Garderob · fre 12 dec 17:00–23:00 · Gala" för en notis. */
export async function shiftLabel(supabase: SupabaseClient, shiftId: string) {
  const { data } = await supabase.from("shifts").select("starts_at, ends_at, function_id, staff_functions(name), events(title)").eq("id", shiftId).single();
  if (!data) return { text: "", functionId: null as string | null };
  const d = data as unknown as { starts_at: string; ends_at: string; function_id: string; staff_functions: { name: string } | null; events: { title: string } | null };
  return {
    text: [d.staff_functions?.name, `${fmtDate(d.starts_at)} ${fmtTime(d.starts_at)}–${fmtTime(d.ends_at)}`, d.events?.title].filter(Boolean).join(" · "),
    functionId: d.function_id,
  };
}

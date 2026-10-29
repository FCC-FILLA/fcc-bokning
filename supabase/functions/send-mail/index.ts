// Skickar e-postkön (email_outbox) via Resend. Anropas varje minut av pg_cron och direkt från appen.
// Utan RESEND_API_KEY gör funktionen ingenting, och mejlen ligger kvar i kön.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async () => {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ skipped: "RESEND_API_KEY saknas" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: settings } = await db.from("app_settings").select("key, value").in("key", ["mail_from", "mail_reply_to", "look_accent", "company_name"]);
  const s = new Map((settings ?? []).map((x: { key: string; value: string }) => [x.key, x.value]));
  const from = s.get("mail_from") || "FCC Bokning <bokning@mail.filadelfiacc.se>";
  const accent = /^#[0-9a-f]{6}$/i.test(s.get("look_accent") ?? "") ? s.get("look_accent")! : "#60272b";

  // Ta upp till 40 mejl i taget. Markera dem först så att två körningar inte skickar samma mejl.
  const { data: queue } = await db.from("email_outbox").select("*").eq("status", "koad").order("created_at").limit(40);
  let sent = 0;
  for (const m of queue ?? []) {
    const { data: claimed } = await db.from("email_outbox").update({ status: "skickas" }).eq("id", m.id).eq("status", "koad").select("id");
    if (!claimed?.length) continue;
    try {
      const attachments: { filename: string; content: string }[] = [];
      if (m.attachment_path) {
        const { data: file } = await db.storage.from("underlag").download(m.attachment_path);
        if (file) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          attachments.push({ filename: m.attachment_name ?? "bilaga", content: btoa(bin) });
        }
      }
      const text = m.link ? `${m.body}\n\n${m.link}` : m.body;
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2a1c1d;max-width:560px">
        ${esc(m.body).replace(/\n/g, "<br>")}
        ${m.link ? `<p style="margin:24px 0"><a href="${esc(m.link)}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">Öppna</a></p><p style="font-size:12px;color:#7a6466">${esc(m.link)}</p>` : ""}
      </div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [m.to_name ? `${m.to_name} <${m.to_email}>` : m.to_email],
          subject: m.subject,
          text,
          html,
          reply_to: m.reply_to || s.get("mail_reply_to") || undefined,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await db.from("email_outbox").update({ status: "skickad", sent_at: new Date().toISOString(), error: null }).eq("id", m.id);
      sent++;
    } catch (e) {
      await db.from("email_outbox").update({ status: "fel", error: String(e).slice(0, 500) }).eq("id", m.id);
    }
  }
  return json({ sent });
});

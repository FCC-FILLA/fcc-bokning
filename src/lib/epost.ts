import "server-only";

/** Puffar avsändaren så att nya mejl i kön går iväg direkt i stället för inom en minut. Misslyckas tyst. */
export async function kickMail() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return;
  try {
    await fetch(`${url}/functions/v1/send-mail`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(3000) });
  } catch {
    /* jobbet var minut tar det */
  }
}

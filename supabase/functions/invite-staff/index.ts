// Skapar (eller återanvänder) ett inloggningskonto för internpersonal och returnerar en
// engångslänk som planeraren skickar till personen. Bara admin, bokare och produktion får anropa.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Fel metod." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";

  // Kontrollera anroparen med dennes egen inloggning.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: allowed } = await asCaller.rpc("can_manage_staff");
  if (allowed !== true) return json({ error: "Du har inte behörighet att bjuda in personal." }, 403);

  const { staff_id, redirect_to } = await req.json().catch(() => ({}));
  if (typeof staff_id !== "string") return json({ error: "Personen saknas." }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: staff } = await admin.from("staff").select("id, kind, name, email, profile_id, active").eq("id", staff_id).single();
  if (!staff) return json({ error: "Personen finns inte." }, 404);
  if (staff.kind !== "intern") return json({ error: "Bara internpersonal får inloggning. Frilans och leverantörer använder sin personliga länk." }, 400);
  if (!staff.active) return json({ error: "Personen är inaktiv." }, 400);
  if (!staff.email) return json({ error: "Lägg in en e-postadress först." }, 400);

  const redirectTo = typeof redirect_to === "string" ? redirect_to : undefined;
  // Ny användare: inbjudan. Finns kontot redan: inloggningslänk.
  let res = await admin.auth.admin.generateLink({ type: "invite", email: staff.email, options: { redirectTo, data: { full_name: staff.name } } });
  if (res.error) res = await admin.auth.admin.generateLink({ type: "magiclink", email: staff.email, options: { redirectTo } });
  if (res.error || !res.data?.user) return json({ error: "Det gick inte att skapa länken." }, 500);

  const userId = res.data.user.id;
  // Koppla ihop personposten och kontot. Nya konton får rollen personal av databasen (handle_new_user);
  // ett befintligt konto behåller sin roll.
  await admin.from("staff").update({ profile_id: userId }).eq("id", staff.id);

  return json({ link: res.data.properties.action_link });
});

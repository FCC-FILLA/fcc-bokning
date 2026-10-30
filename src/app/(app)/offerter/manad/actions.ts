"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBooker } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Skapar månadens offertutkast (eller gör om ett utkast). Inget skickas. */
export async function createMonthlyQuote(fd: FormData) {
  await requireBooker();
  const company = String(fd.get("company") ?? "");
  const month = String(fd.get("month") ?? "");
  const back = `/offerter/manad?kund=${encodeURIComponent(company)}&manad=${encodeURIComponent(month)}`;
  if (!/^[0-9a-f-]{36}$/i.test(company) || !/^\d{4}-\d{2}$/.test(month)) redirect(`${back}&fel=${encodeURIComponent("Välj kund och månad.")}`);
  const extra = fd.getAll("extra").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_monthly_quote", {
    p_company: company,
    p_month: `${month}-01`,
    p_replace: fd.get("replace") === "1",
    p_extra: extra,
  });
  if (error || !data) redirect(`${back}&fel=${encodeURIComponent(`Kunde inte skapa offerten: ${error?.message ?? "okänt fel"}`)}`);
  revalidatePath("/offerter");
  redirect(`/offerter/${data}`);
}

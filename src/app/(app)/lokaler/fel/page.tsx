import { redirect } from "next/navigation";

/** Felanmälningarna har flyttat till Fastighet. Gamla länkar (t.ex. i notiser) leds vidare. */
export default async function OldIssues({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(`/fastighet/fel${qs ? `?${qs}` : ""}`);
}

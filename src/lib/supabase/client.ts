import { createBrowserClient } from "@supabase/ssr";

// Supabase-klient för komponenter som körs i webbläsaren.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

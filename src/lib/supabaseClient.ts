import { createClient } from "@supabase/supabase-js";

// Create the client only when env vars are present. Otherwise expose a shim
// that throws on use. This prevents app-wide crashes during initial load when
// env vars are not configured yet and allows the UI to render a helpful notice.
const url = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

function createSupabaseSafe() {
  if (typeof url === "string" && url && typeof anon === "string" && anon) {
    return createClient(url, anon);
  }
  // Minimal proxy that fails fast if accidentally used when not configured
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
        );
      },
    }
  ) as any;
}

export const supabase = createSupabaseSafe() as any;

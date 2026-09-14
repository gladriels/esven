import { createClient } from "@supabase/supabase-js";

// Service-role client, built per request from `env` (Workers only hand out
// secrets inside a request, not at module load). It bypasses row-level
// security, so it's used only for trusted server-side work and never exposed
// to the browser.
export function adminClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server configuration is missing");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

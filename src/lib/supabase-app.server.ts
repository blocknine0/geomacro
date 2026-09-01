import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * App-owned Supabase client (separate from any Lovable Cloud project).
 * Uses APP_SUPABASE_URL + APP_SUPABASE_ANON_KEY secrets. RLS applies as anon.
 * Returns null when not configured so callers can degrade gracefully.
 */
// IMPORTANT: do not cache `null`. On Cloudflare Workers env binds at
// request time, so a module-init read can be undefined even when later
// requests do have the secret. Only memoise a successfully-built client.
let cachedClient: SupabaseClient | null = null;

export function getAppSupabase(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.APP_SUPABASE_URL;
  // Prefer the service-role key for server-side writes so that the public
  // anon role does NOT need INSERT/UPDATE policies on public.events
  // (which would otherwise allow anyone with the anon key to inject
  // fabricated AI-classified events). Fall back to anon only for read-only
  // degradation when the service key is not configured.
  const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.APP_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anon;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

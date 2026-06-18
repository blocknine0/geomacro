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
  const anon = process.env.APP_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  cachedClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export type StoredEvent = {
  source_url: string;
  source_title: string;
  source_name?: string | null;
  category: string;
  narrative: string;
  summary: string;
  stage: string;
  severity: number;
  confidence: number;
  delta: number;
  published_at: string;
};

/**
 * Upsert classified events into the public.events table.
 * Best-effort: logs and swallows errors so the live feed still renders if
 * the table is missing / RLS blocks writes / the project is unreachable.
 *
 * Expected table (run in your Supabase SQL editor):
 *
 *   create table if not exists public.events (
 *     id uuid primary key default gen_random_uuid(),
 *     source_url text unique not null,
 *     source_title text not null,
 *     source_name text,
 *     category text not null,
 *     narrative text not null,
 *     summary text not null,
 *     stage text not null,
 *     severity int not null,
 *     confidence int not null,
 *     delta int not null,
 *     published_at timestamptz not null,
 *     created_at timestamptz not null default now()
 *   );
 *   alter table public.events enable row level security;
 *   create policy "events_anon_read" on public.events for select to anon using (true);
 *   create policy "events_anon_write" on public.events for insert to anon with check (true);
 *   create policy "events_anon_update" on public.events for update to anon using (true);
 */
export async function upsertEvents(events: StoredEvent[]): Promise<void> {
  if (events.length === 0) return;
  const sb = getAppSupabase();
  if (!sb) {
    console.warn("[upsertEvents] APP_SUPABASE_URL/APP_SUPABASE_ANON_KEY missing — skipping persistence");
    return;
  }
  try {
    const { error } = await sb
      .from("events")
      .upsert(events, { onConflict: "source_url" });
    if (error) {
      console.error("[upsertEvents] supabase error", error.message, error.details, error.hint);
    } else {
      console.log(`[upsertEvents] upserted ${events.length} events`);
    }
  } catch (err) {
    console.error("[upsertEvents] threw", err);
  }
}
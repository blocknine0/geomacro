import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEventStage, type EventStage } from "./event-stage";

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

export type StoredEvent = {
  source_url: string;
  source_title: string;
  source_name?: string | null;
  category: string;
  narrative: string;
  summary: string;
  stage: EventStage | string;
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
 *   -- Public read is intentional: the live feed is unauthenticated.
 *   create policy "events_anon_read" on public.events for select to anon using (true);
 *   -- Writes are server-only via the service-role key set as the
 *   -- APP_SUPABASE_SERVICE_ROLE_KEY secret. Do NOT create anon insert/
 *   -- update policies — that would let any visitor inject fake events.
 *   drop policy if exists "events_anon_write" on public.events;
 *   drop policy if exists "events_anon_update" on public.events;
 */
export async function upsertEvents(events: StoredEvent[]): Promise<void> {
  if (events.length === 0) return;
  const sb = getAppSupabase();
  if (!sb) {
    console.warn("[upsertEvents] APP_SUPABASE_URL/APP_SUPABASE_ANON_KEY missing — skipping persistence");
    return;
  }
  try {
    // Defensive: normalize every stage before it touches the DB so legacy
    // / AI-hallucinated values (e.g. "Emerging") never reach the Arena.
    const safeEvents = events.map((e) => ({
      ...e,
      stage: normalizeEventStage(e.stage),
    }));
    const { error } = await sb
      .from("events")
      .upsert(safeEvents, { onConflict: "source_url" });
    if (error) {
      console.error("[upsertEvents] supabase error", error.message, error.details, error.hint);
    } else {
      console.log(`[upsertEvents] upserted ${events.length} events`);
    }
  } catch (err) {
    console.error("[upsertEvents] threw", err);
  }
}
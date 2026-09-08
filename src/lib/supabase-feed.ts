import { createClient } from "@supabase/supabase-js";
import type { EventStage } from "./event-stage";

/**
 * Public browser read client.
 *
 * Production rule: browser-visible Supabase credentials are not a source of
 * truth. Lovable/hosting platforms can inject their own VITE_SUPABASE_* pair,
 * which previously caused Arena and older public read surfaces to authenticate
 * against the wrong project. Every PostgREST GET/HEAD is therefore sent to a
 * same-origin, read-only server proxy. The proxy uses APP_SUPABASE_ANON_KEY,
 * applies a table allowlist and rejects writes.
 *
 * Realtime is deliberately disabled on this public client. The two historical
 * realtime consumers (Arena refresh and jury/dispute status) already have
 * polling fallbacks. Avoiding a browser WebSocket removes the final dependency
 * on hosting-injected Supabase credentials without changing any transaction or
 * settlement logic.
 */
const AUTHORITATIVE_SUPABASE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const AUTHORITATIVE_SUPABASE_URL =
  `https://${AUTHORITATIVE_SUPABASE_PROJECT_REF}.supabase.co`;

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

const clientUrl = configuredUrl?.includes(AUTHORITATIVE_SUPABASE_PROJECT_REF)
  ? configuredUrl
  : AUTHORITATIVE_SUPABASE_URL;
const clientKey = configuredAnonKey?.trim() || "public-read-proxy";

async function publicReadFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);

  if (url.pathname.startsWith("/rest/v1/")) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(JSON.stringify({ error: "Public data client is read-only" }), {
        status: 405,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const target = `${url.pathname}${url.search}`;
    const proxyUrl = `/api/public-data-proxy?target=${encodeURIComponent(target)}`;
    const headers = new Headers();
    for (const name of ["accept", "accept-profile", "range", "range-unit", "prefer"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    return fetch(proxyUrl, {
      method: request.method,
      headers,
      signal: request.signal,
      credentials: "same-origin",
    });
  }

  return fetch(request);
}

const rawPublicClient = createClient(clientUrl, clientKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: publicReadFetch },
});

const noRealtimeChannel = {
  on() {
    return noRealtimeChannel;
  },
  subscribe() {
    return noRealtimeChannel;
  },
  unsubscribe() {
    return Promise.resolve("ok" as const);
  },
};

/**
 * Preserve the normal Supabase query-builder API while making `.channel()` a
 * no-op on this read-only browser client. Existing polling remains active.
 */
export const supabaseFeed = new Proxy(rawPublicClient, {
  get(target, prop, receiver) {
    if (prop === "channel") return () => noRealtimeChannel;
    if (prop === "removeChannel") return () => Promise.resolve("ok" as const);
    return Reflect.get(target, prop, receiver);
  },
}) as typeof rawPublicClient;

export type StoredEventRow = {
  id: string;
  source_url: string;
  source_title: string;
  source_name: string | null;
  source_domain?: string | null;
  category: string;
  narrative: string;
  summary: string;
  stage: EventStage | string;
  severity: number;
  confidence: number;
  delta: number;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_scored_at?: string | null;
  classification_input_hash?: string | null;
  published_at: string;
  created_at: string;
  resolution_at: string | null;
  market_created?: boolean | null;
  market_threshold?: number | null;
  market_resolved?: boolean | null;
  market_address?: string | null;
  ai_processed?: boolean | null;
  ai_tentative_winner?: "HAWK" | "DOVE" | string | null;
  /** Reasoning written by the backend resolver alongside ai_tentative_winner. */
  ai_reasoning?: string | null;
  ai_resolved_at?: string | null;
  lifecycle_stage?: "active" | "awaiting_dispute" | "disputed" | "completed" | string | null;
  disputer_address?: string | null;
  dispute_window_ends_at?: string | null;
  /** Pre-generated analyst briefing (written once by the scheduled backend
   *  script). The frontend never generates these live. */
  hawk_reasoning?: string | null;
  dove_reasoning?: string | null;
  hawk_conviction?: number | null;
  dove_conviction?: number | null;
  briefing_generated_at?: string | null;
  /** Explicit human-readable market question written by the publisher.
   *  When present it overrides the auto-generated severity template. */
  market_question?: string | null;
};

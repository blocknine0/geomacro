import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUTHORITATIVE_APP_SUPABASE_PROJECT_REF = "ldpwajisioljyjtojvfx";
export const APP_SUPABASE_REQUEST_TIMEOUT_MS = 8_000;
export const APP_SUPABASE_CIRCUIT_FAILURE_THRESHOLD = 3;
export const APP_SUPABASE_CIRCUIT_OPEN_MS = 30_000;

type AppSupabaseConfig = {
  url: string;
  key: string;
  source:
    | "app-service-role"
    | "app-trusted-service-role"
    | "app-anon"
    | "trusted-service-role"
    | "trusted-app-service-role"
    | "trusted-anon";
};

function normalized(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function projectRefOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    const suffix = ".supabase.co";
    if (!parsed.hostname.endsWith(suffix)) return null;
    return parsed.hostname.slice(0, -suffix.length) || null;
  } catch {
    return null;
  }
}

function isExplicitLocalDevelopmentUrl(url: string, env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "production") return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export function resolveAppSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppSupabaseConfig | null {
  const appUrl = normalized(env.APP_SUPABASE_URL);
  const trustedUrl = normalized(env.SUPABASE_URL);
  const appService = normalized(env.APP_SUPABASE_SERVICE_ROLE_KEY);
  const trustedService = normalized(env.SUPABASE_SERVICE_ROLE_KEY);
  const appAnon = normalized(env.APP_SUPABASE_ANON_KEY);
  const trustedAnon = normalized(env.SUPABASE_ANON_KEY);

  const candidates: Array<AppSupabaseConfig | null> = [
    appUrl && appService
      ? { url: appUrl, key: appService, source: "app-service-role" }
      : null,
    appUrl && trustedService
      ? { url: appUrl, key: trustedService, source: "app-trusted-service-role" }
      : null,
    appUrl && appAnon
      ? { url: appUrl, key: appAnon, source: "app-anon" }
      : null,
    trustedUrl && trustedService
      ? { url: trustedUrl, key: trustedService, source: "trusted-service-role" }
      : null,
    trustedUrl && appService
      ? { url: trustedUrl, key: appService, source: "trusted-app-service-role" }
      : null,
    trustedUrl && trustedAnon
      ? { url: trustedUrl, key: trustedAnon, source: "trusted-anon" }
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const projectRef = projectRefOf(candidate.url);
    if (
      projectRef === AUTHORITATIVE_APP_SUPABASE_PROJECT_REF ||
      isExplicitLocalDevelopmentUrl(candidate.url, env)
    ) {
      return candidate;
    }
  }

  return null;
}

let failureCount = 0;
let circuitOpenedAt = 0;

function isTransientStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status >= 520 && status <= 524)
  );
}

function isCircuitOpen(now = Date.now()): boolean {
  if (circuitOpenedAt === 0) return false;
  if (now - circuitOpenedAt >= APP_SUPABASE_CIRCUIT_OPEN_MS) {
    circuitOpenedAt = 0;
    failureCount = 0;
    return false;
  }
  return true;
}

function noteSuccess() {
  failureCount = 0;
  circuitOpenedAt = 0;
}

function noteFailure() {
  failureCount += 1;
  if (
    failureCount >= APP_SUPABASE_CIRCUIT_FAILURE_THRESHOLD &&
    circuitOpenedAt === 0
  ) {
    circuitOpenedAt = Date.now();
  }
}

function circuitOpenResponse(): Response {
  return new Response(JSON.stringify({ message: "Supabase temporarily unavailable" }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.ceil(APP_SUPABASE_CIRCUIT_OPEN_MS / 1000)),
      "x-geomacro-degraded": "supabase-circuit-open",
    },
  });
}

function methodOf(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

async function resilientAppSupabaseFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (isCircuitOpen()) return circuitOpenResponse();

  const method = methodOf(input, init);
  const idempotentRead =
    method === "GET" || method === "HEAD" || method === "OPTIONS";
  const attempts = idempotentRead ? 2 : 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(APP_SUPABASE_REQUEST_TIMEOUT_MS);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await globalThis.fetch(input, { ...init, signal });
      if (isTransientStatus(response.status)) {
        noteFailure();
        if (attempt + 1 < attempts && !isCircuitOpen()) {
          await new Promise((resolve) => setTimeout(resolve, 125 * (attempt + 1)));
          continue;
        }
      } else {
        noteSuccess();
      }
      return response;
    } catch (error) {
      lastError = error;
      noteFailure();
      if (attempt + 1 < attempts && !isCircuitOpen()) {
        await new Promise((resolve) => setTimeout(resolve, 125 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Supabase request failed");
}

let cachedClient: SupabaseClient | null = null;
let cachedIdentity: string | null = null;

/**
 * App-owned Supabase client (separate from any Lovable Cloud project).
 *
 * Continuity rules:
 * - never consumes browser VITE_SUPABASE_* values;
 * - hard-bounds every request;
 * - one bounded retry only for idempotent reads;
 * - never automatically replays writes/RPCs;
 * - opens a short circuit after repeated transient failures so a Supabase
 *   incident cannot make every Geomacro request hang or stampede the free tier.
 */
export function getAppSupabase(): SupabaseClient | null {
  const config = resolveAppSupabaseConfig();
  if (!config) return null;

  const identity = `${config.url}|${config.source}`;
  if (cachedClient && cachedIdentity === identity) return cachedClient;

  cachedClient = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { retry: false },
    global: { fetch: resilientAppSupabaseFetch },
  });
  cachedIdentity = identity;
  return cachedClient;
}

import process from "node:process";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { supabasePrimaryTrafficAllowed } from "./supabase-runtime-mode.server";

let cachedRiskClient: SupabaseClient | null = null;
let cachedRiskIdentity: string | null = null;

export const AUTHORITATIVE_RISK_PROJECT_REF = "ldpwajisioljyjtojvfx";

/**
 * Hard upper bound for privileged Risk Object / Risk Gate database calls.
 *
 * A degraded database must fail closed instead of leaving authenticated
 * commercial requests hanging indefinitely.
 */
export const RISK_SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
export const RISK_SUPABASE_CIRCUIT_FAILURE_THRESHOLD = 3;
export const RISK_SUPABASE_CIRCUIT_OPEN_MS = 30_000;

let riskFailureCount = 0;
let riskCircuitOpenedAt = 0;

type RiskSupabaseConfig = {
  url: string;
  key: string;
  source: "app-service-role" | "trusted-service-role";
};

function normalized(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createRiskSupabaseRequestSignal(
  upstreamSignal?: AbortSignal | null,
  timeoutMs = RISK_SUPABASE_REQUEST_TIMEOUT_MS,
): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error(
      "Risk Supabase timeout must be between 1 and 60000 milliseconds",
    );
  }

  const deadlineSignal = AbortSignal.timeout(timeoutMs);
  return upstreamSignal
    ? AbortSignal.any([upstreamSignal, deadlineSignal])
    : deadlineSignal;
}

function isTransientRiskStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status >= 520 && status <= 524)
  );
}

function isRiskCircuitOpen(now = Date.now()): boolean {
  if (riskCircuitOpenedAt === 0) return false;
  if (now - riskCircuitOpenedAt >= RISK_SUPABASE_CIRCUIT_OPEN_MS) {
    riskCircuitOpenedAt = 0;
    riskFailureCount = 0;
    return false;
  }
  return true;
}

function noteRiskSuccess() {
  riskFailureCount = 0;
  riskCircuitOpenedAt = 0;
}

function noteRiskFailure() {
  riskFailureCount += 1;
  if (
    riskFailureCount >= RISK_SUPABASE_CIRCUIT_FAILURE_THRESHOLD &&
    riskCircuitOpenedAt === 0
  ) {
    riskCircuitOpenedAt = Date.now();
  }
}

function riskCircuitOpenResponse(): Response {
  return new Response(JSON.stringify({ message: "Risk store temporarily unavailable" }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.ceil(RISK_SUPABASE_CIRCUIT_OPEN_MS / 1000)),
      "x-geomacro-degraded": "risk-supabase-circuit-open",
    },
  });
}

async function riskSupabaseFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (isRiskCircuitOpen()) return riskCircuitOpenResponse();

  try {
    const response = await globalThis.fetch(input, {
      ...init,
      signal: createRiskSupabaseRequestSignal(init?.signal),
    });
    if (isTransientRiskStatus(response.status)) noteRiskFailure();
    else noteRiskSuccess();
    return response;
  } catch (error) {
    noteRiskFailure();
    throw error;
  }
}

function projectRefOf(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const suffix = ".supabase.co";
    if (!host.endsWith(suffix)) return null;
    return host.slice(0, -suffix.length) || null;
  } catch {
    return null;
  }
}

function isExplicitLocalDevelopmentUrl(
  url: string,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "production") return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1")
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the privileged Risk Object/Risk Gate database source.
 *
 * Remote traffic remains pinned to the authoritative Geomacro Supabase project.
 * A loopback Supabase URL is accepted only outside NODE_ENV=production so CI can
 * run disposable, migration-complete Risk Gate staging without touching the
 * production project or requiring a permanent staging credential. Arbitrary
 * remote Supabase projects remain rejected in every environment.
 */
export function resolveRiskSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): RiskSupabaseConfig | null {
  if (!supabasePrimaryTrafficAllowed(env)) return null;

  const appUrl = normalized(env.APP_SUPABASE_URL);
  const trustedUrl = normalized(env.SUPABASE_URL);
  const appService = normalized(env.APP_SUPABASE_SERVICE_ROLE_KEY);
  const trustedService = normalized(env.SUPABASE_SERVICE_ROLE_KEY);

  const candidates: Array<RiskSupabaseConfig | null> = [
    appUrl && appService
      ? { url: appUrl, key: appService, source: "app-service-role" }
      : null,
    trustedUrl && trustedService
      ? { url: trustedUrl, key: trustedService, source: "trusted-service-role" }
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (
      projectRefOf(candidate.url) === AUTHORITATIVE_RISK_PROJECT_REF ||
      isExplicitLocalDevelopmentUrl(candidate.url, env)
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * Dedicated privileged Supabase client for Geomacro Risk Object / Risk Gate.
 *
 * Production serving defaults to Supabase cold-standby. Runtime traffic is
 * permitted only when GEOMACRO_SUPABASE_RUNTIME_MODE=primary (or in a
 * non-production runtime where primary remains the default). This makes the
 * existing verified B2 continuity paths the normal production serving path and
 * prevents an egress-quota incident from becoming a customer-path dependency.
 *
 * Security and continuity rules:
 * - server-only, service-role only;
 * - remote URLs are authoritative-project-only;
 * - loopback URLs are permitted only outside production for disposable CI/dev;
 * - never falls back to anon and never exposes credentials to browser code;
 * - every network request has a hard deadline;
 * - automatic PostgREST retries are disabled so privileged POST/RPC writes are
 *   never implicitly replayed;
 * - repeated transient failures open a short circuit so a Supabase incident
 *   cannot exhaust request workers or connection capacity.
 */
export function getRiskSupabase(): SupabaseClient | null {
  const config = resolveRiskSupabaseConfig();
  if (!config) return null;

  const identity = `${config.url}|${config.source}`;
  if (cachedRiskClient && cachedRiskIdentity === identity) return cachedRiskClient;

  cachedRiskClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { retry: false },
    global: { fetch: riskSupabaseFetch },
  });
  cachedRiskIdentity = identity;

  return cachedRiskClient;
}

export function requireRiskSupabase(): SupabaseClient {
  const db = getRiskSupabase();
  if (!db) {
    throw new Error(
      "Risk Supabase is in standby or is not configured for the authoritative project / explicit local nonproduction runtime",
    );
  }
  return db;
}

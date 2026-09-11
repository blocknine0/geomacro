import process from "node:process";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";


let cachedRiskClient:
  SupabaseClient | null = null;


const AUTHORITATIVE_RISK_PROJECT_REF =
  "ldpwajisioljyjtojvfx";


/**
 * Hard upper bound for privileged Risk Object / Risk Gate database calls.
 *
 * A degraded database must fail closed instead of leaving authenticated
 * commercial requests hanging indefinitely. Keep this conservative enough
 * for normal WAN latency while still producing a deterministic failure.
 */
export const RISK_SUPABASE_REQUEST_TIMEOUT_MS =
  15_000;


export function createRiskSupabaseRequestSignal(
  upstreamSignal?: AbortSignal | null,
  timeoutMs = RISK_SUPABASE_REQUEST_TIMEOUT_MS,
): AbortSignal {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60_000
  ) {
    throw new Error(
      "Risk Supabase timeout must be between 1 and 60000 milliseconds",
    );
  }

  const deadlineSignal =
    AbortSignal.timeout(timeoutMs);

  return upstreamSignal
    ? AbortSignal.any([
        upstreamSignal,
        deadlineSignal,
      ])
    : deadlineSignal;
}


function riskSupabaseFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ReturnType<typeof fetch> {
  return globalThis.fetch(
    input,
    {
      ...init,
      signal:
        createRiskSupabaseRequestSignal(
          init?.signal,
        ),
    },
  );
}


function projectRefOf(
  url: string,
): string | null {
  try {
    const host =
      new URL(url).hostname;

    const suffix =
      ".supabase.co";

    if (!host.endsWith(suffix)) {
      return null;
    }

    return host.slice(
      0,
      -suffix.length,
    ) || null;
  } catch {
    return null;
  }
}


/**
 * Dedicated privileged Supabase client for
 * Geomacro Risk Object / Risk Gate infrastructure.
 *
 * IMPORTANT:
 * - server-only
 * - service-role only
 * - never falls back to anon
 * - never expose this client to browser code
 * - only the authoritative Risk project is accepted
 * - every network request has a hard deadline and fails closed on timeout
 */
export function
getRiskSupabase():
  SupabaseClient | null {
  if (cachedRiskClient) {
    return cachedRiskClient;
  }

  const candidates = [
    {
      url:
        process.env.APP_SUPABASE_URL,

      key:
        process.env
          .APP_SUPABASE_SERVICE_ROLE_KEY,
    },
    {
      url:
        process.env.SUPABASE_URL,

      key:
        process.env
          .SUPABASE_SERVICE_ROLE_KEY,
    },
  ];

  const selected =
    candidates.find(
      (candidate) =>
        Boolean(
          candidate.url &&
          candidate.key,
        ) &&
        projectRefOf(
          candidate.url as string,
        ) ===
          AUTHORITATIVE_RISK_PROJECT_REF,
    );

  if (
    !selected?.url ||
    !selected.key
  ) {
    return null;
  }

  cachedRiskClient =
    createClient(
      selected.url,
      selected.key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          fetch:
            riskSupabaseFetch,
        },
      },
    );

  return cachedRiskClient;
}


export function
requireRiskSupabase():
  SupabaseClient {
  const db =
    getRiskSupabase();

  if (!db) {
    throw new Error(
      "Risk Supabase service-role client is not configured for the authoritative project",
    );
  }

  return db;
}
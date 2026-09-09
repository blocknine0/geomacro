import process from "node:process";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";


let cachedRiskClient:
  SupabaseClient | null = null;


const AUTHORITATIVE_RISK_PROJECT_REF =
  "ldpwajisioljyjtojvfx";


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

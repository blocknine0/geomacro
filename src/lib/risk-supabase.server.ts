import process from "node:process";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";


let cachedRiskClient:
  SupabaseClient | null = null;


/**
 * Dedicated privileged Supabase client for
 * Geomacro Risk Object / Risk Gate infrastructure.
 *
 * IMPORTANT:
 * - server-only
 * - service-role only
 * - never falls back to anon
 * - never expose this client to browser code
 */
export function
getRiskSupabase():
  SupabaseClient | null {
  if (cachedRiskClient) {
    return cachedRiskClient;
  }

  const url =
    process.env.SUPABASE_URL ??
    process.env.APP_SUPABASE_URL;

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ??
    process.env
      .APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  cachedRiskClient =
    createClient(
      url,
      serviceKey,
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
      "Risk Supabase service-role client is not configured",
    );
  }

  return db;
}

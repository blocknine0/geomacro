import process from "node:process";

/**
 * This mode applies ONLY to the separate historical Supabase warehouse.
 * Main Geomacro's GEOMACRO_SUPABASE_RUNTIME_MODE controls its own
 * product/recovery Supabase and must not govern historical credentials.
 *
 * Historical queries are explicitly opt-in and B2-first in the caller
 * to avoid moving routine customer read traffic onto the warehouse.
 */
export type HistoricalSupabaseReadMode = "off" | "fallback";

export function historicalSupabaseReadMode(
  env: NodeJS.ProcessEnv = process.env,
): HistoricalSupabaseReadMode {
  const configured = String(
    env.GEOMACRO_HISTORICAL_SUPABASE_READ_MODE ?? "off",
  ).trim().toLowerCase();

  if (!configured || configured === "off") return "off";
  if (configured === "fallback") return "fallback";
  throw new Error(
    "GEOMACRO_HISTORICAL_SUPABASE_READ_MODE must be off or fallback",
  );
}

export function historicalSupabaseReadFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return historicalSupabaseReadMode(env) === "fallback";
}

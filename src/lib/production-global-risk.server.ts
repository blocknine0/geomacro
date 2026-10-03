import { readB2PublicRisk } from "./b2-live.server";
import type { GlobalRisk } from "./global-risk.types";

/**
 * Customer/commercial machine runtime risk reader.
 *
 * Production delivery must never depend on Supabase availability. The verified
 * B2 projection is the durable serving authority. If that package is missing,
 * stale, corrupt, or fails its embedded verification checks, fail closed.
 */
export async function readProductionGlobalRisk(): Promise<GlobalRisk> {
  const risk = await readB2PublicRisk();
  if (!risk) {
    throw new Error("VERIFIED_B2_GLOBAL_RISK_UNAVAILABLE");
  }
  return risk;
}

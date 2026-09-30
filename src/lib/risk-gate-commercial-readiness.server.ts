import { getRiskSupabase } from "./risk-supabase.server";
import {
  readB2SourceNetworkStatus,
  type B2SourceNetworkStatus,
} from "./b2-live.server";

export const RISK_GATE_COMMERCIAL_MODE_ENV =
  "GEOMACRO_RISK_GATE_COMMERCIAL_MODE" as const;

export class RiskGateCommercialReadinessError extends Error {
  readonly code = "RISK_GATE_SOURCE_NETWORK_NOT_READY";
  readonly status = 503;

  constructor(message = "Risk Gate commercial source-network prerequisites are not ready") {
    super(message);
    this.name = "RiskGateCommercialReadinessError";
  }
}

function commercialModeEnabled(): boolean {
  return process.env[RISK_GATE_COMMERCIAL_MODE_ENV]?.trim().toLowerCase() === "true";
}

export function isCommercialSourceNetworkReady(
  status: Partial<B2SourceNetworkStatus> | null | undefined,
): boolean {
  return (
    status?.source_network_100_complete === true &&
    status?.gdelt_gal_freshness_complete === true &&
    status?.source_network_launch_complete === true
  );
}

async function assertVerifiedB2Fallback(): Promise<void> {
  const fallback = await readB2SourceNetworkStatus();
  if (!isCommercialSourceNetworkReady(fallback)) {
    throw new RiskGateCommercialReadinessError();
  }
}

/**
 * Testnet/private-pilot mode remains available without the commercial gate.
 *
 * When commercial mode is enabled, source-network certification and the
 * realtime launch gate become hard prerequisites for a successful evaluation.
 * Supabase remains authoritative when it responds successfully. A healthy
 * Supabase response that says the launch gate is false can never be overridden
 * by B2. Only a missing/unavailable/erroring Supabase read may use the recent,
 * schema-validated B2 snapshot, which itself fails closed when stale or absent.
 */
export async function assertRiskGateCommercialReadiness(): Promise<void> {
  if (!commercialModeEnabled()) return;

  const db = getRiskSupabase();
  if (!db) {
    await assertVerifiedB2Fallback();
    return;
  }

  try {
    const { data, error } = await db
      .from("live_source_network_launch_status")
      .select(
        "source_network_100_complete,gdelt_gal_freshness_complete,source_network_launch_complete",
      )
      .maybeSingle();

    if (error) {
      await assertVerifiedB2Fallback();
      return;
    }

    if (!isCommercialSourceNetworkReady(data)) {
      throw new RiskGateCommercialReadinessError();
    }
  } catch (error) {
    if (error instanceof RiskGateCommercialReadinessError) throw error;
    await assertVerifiedB2Fallback();
  }
}

import { getRiskSupabase } from "./risk-supabase.server";

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

/**
 * Testnet/private-pilot mode remains available without the commercial gate.
 *
 * When commercial mode is enabled, source-network certification and the
 * realtime launch gate become hard prerequisites for a successful evaluation.
 * This prevents a future production flag from silently bypassing source
 * certification while allowing controlled testnet development today.
 */
export async function assertRiskGateCommercialReadiness(): Promise<void> {
  if (!commercialModeEnabled()) return;

  const db = getRiskSupabase();
  if (!db) {
    throw new RiskGateCommercialReadinessError();
  }

  const { data, error } = await db
    .from("live_source_network_launch_status")
    .select(
      "source_network_100_complete,gdelt_gal_freshness_complete,source_network_launch_complete",
    )
    .maybeSingle();

  if (
    error ||
    data?.source_network_100_complete !== true ||
    data?.gdelt_gal_freshness_complete !== true ||
    data?.source_network_launch_complete !== true
  ) {
    throw new RiskGateCommercialReadinessError();
  }
}

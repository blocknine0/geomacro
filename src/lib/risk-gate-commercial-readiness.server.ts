import {
  readB2CommercialSourceRights,
  readB2SourceNetworkStatus,
} from "./b2-live.server";
import {
  evaluatePaidOutputSourceReadiness,
  type PaidOutputSourceReadinessRow,
} from "./paid-output-source-readiness";
import { getRiskSupabase } from "./risk-supabase.server";

export const RISK_GATE_COMMERCIAL_MODE_ENV =
  "GEOMACRO_RISK_GATE_COMMERCIAL_MODE" as const;

export class RiskGateCommercialReadinessError extends Error {
  readonly code = "RISK_GATE_SOURCE_NETWORK_NOT_READY";
  readonly status = 503;

  constructor(message = "Risk Gate paid-output source prerequisites are not ready") {
    super(message);
    this.name = "RiskGateCommercialReadinessError";
  }
}

function commercialModeEnabled(): boolean {
  return process.env[RISK_GATE_COMMERCIAL_MODE_ENV]?.trim().toLowerCase() === "true";
}

export function isCommercialPaidOutputReady(
  rows: Iterable<PaidOutputSourceReadinessRow>,
  realtimeFreshnessComplete: boolean,
): boolean {
  return (
    realtimeFreshnessComplete === true &&
    evaluatePaidOutputSourceReadiness(rows).ready
  );
}

async function assertVerifiedB2Fallback(): Promise<void> {
  const [rights, network] = await Promise.all([
    readB2CommercialSourceRights(),
    readB2SourceNetworkStatus(),
  ]);
  if (
    !rights ||
    !network ||
    !isCommercialPaidOutputReady(rights, network.gdelt_gal_freshness_complete)
  ) {
    throw new RiskGateCommercialReadinessError();
  }
}

/**
 * Testnet/private-pilot mode remains available without the commercial gate.
 *
 * Commercial readiness is scoped to the governed sources that are explicitly
 * allowed to influence a paid Geomacro derived response. The much broader
 * source-ingestion universe remains separately auditable and fail-closed, but
 * is not a paid-delivery prerequisite simply because it exists in the registry.
 *
 * Supabase remains authoritative while it responds successfully. A healthy
 * Supabase response that says the paid source set or realtime freshness is not
 * ready can never be overridden by B2. Only an unavailable/erroring primary
 * read may use the recent, schema-validated B2 continuity snapshots.
 */
export async function assertRiskGateCommercialReadiness(): Promise<void> {
  if (!commercialModeEnabled()) return;

  const db = getRiskSupabase();
  if (!db) {
    await assertVerifiedB2Fallback();
    return;
  }

  try {
    const sourceResult = await db
      .from("live_external_sources")
      .select("source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals")
      .eq("enabled_for_commercial_signals", true)
      .order("source_id", { ascending: true });

    if (sourceResult.error) {
      await assertVerifiedB2Fallback();
      return;
    }

    const sourceRows = sourceResult.data ?? [];
    const sourceIds = sourceRows
      .map((row) => String(row.source_id ?? "").trim())
      .filter(Boolean);

    let certificationBySource = new Map<string, string | null>();
    if (sourceIds.length > 0) {
      const certificationResult = await db
        .from("live_source_certification_records")
        .select("source_id,certification_state")
        .in("source_id", sourceIds);
      if (certificationResult.error) {
        await assertVerifiedB2Fallback();
        return;
      }
      certificationBySource = new Map(
        (certificationResult.data ?? []).map((row) => [
          String(row.source_id ?? "").trim(),
          typeof row.certification_state === "string" ? row.certification_state : null,
        ]),
      );
    }

    const paidRows: PaidOutputSourceReadinessRow[] = sourceRows.map((row) => ({
      source_id: String(row.source_id ?? "").trim(),
      category: typeof row.category === "string" ? row.category : null,
      certification_state:
        certificationBySource.get(String(row.source_id ?? "").trim()) ?? null,
      commercial_usage_status:
        typeof row.commercial_usage_status === "string"
          ? row.commercial_usage_status
          : null,
      enabled_for_ingestion: row.enabled_for_ingestion === true,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
    }));

    const paidReadiness = evaluatePaidOutputSourceReadiness(paidRows);
    if (!paidReadiness.ready) {
      throw new RiskGateCommercialReadinessError();
    }

    const freshnessResult = await db
      .from("live_source_network_launch_status")
      .select("gdelt_gal_freshness_complete")
      .maybeSingle();
    if (freshnessResult.error) {
      await assertVerifiedB2Fallback();
      return;
    }
    if (freshnessResult.data?.gdelt_gal_freshness_complete !== true) {
      throw new RiskGateCommercialReadinessError();
    }
  } catch (error) {
    if (error instanceof RiskGateCommercialReadinessError) throw error;
    await assertVerifiedB2Fallback();
  }
}

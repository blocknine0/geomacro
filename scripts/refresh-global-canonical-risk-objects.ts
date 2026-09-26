import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { publishCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { verifyCommercialRiskObjectArtifact } from "../src/lib/commercial-risk-object-policy";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const CONCURRENCY = Math.max(
  1,
  Math.min(12, Number(process.env.GLOBAL_CANONICAL_REFRESH_CONCURRENCY ?? 6)),
);
const MIN_READY = Math.max(
  0,
  Number(process.env.GLOBAL_CANONICAL_MIN_READY ?? 100),
);
const MIN_SOVEREIGN_DENOMINATOR = Math.max(
  1,
  Number(process.env.GLOBAL_CANONICAL_MIN_SOVEREIGN_DENOMINATOR ?? 190),
);

async function loadEnabledSovereigns() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_country_registry")
    .select("iso3,country_name,region,subregion")
    .eq("enabled", true)
    .order("iso3", { ascending: true });

  if (result.error) throw result.error;

  return (result.data ?? [])
    .map((row) => ({
      iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      country_name: String(row.country_name ?? "").trim(),
      region: row.region == null ? null : String(row.region),
      subregion: row.subregion == null ? null : String(row.subregion),
    }))
    .filter(
      (row) =>
        /^[A-Z]{3}$/.test(row.iso3) &&
        classifyGlobalEntity(row.iso3) === "SOVEREIGN",
    );
}

function normalizeFailureReasons(row: {
  status: "PAID_READY" | "FAIL_CLOSED";
  reason_codes: readonly string[];
  verification_status: string | null;
  commercial_eligibility_status: string | null;
  decision_readiness: string | null;
  signature_valid: boolean;
}) {
  if (row.status !== "FAIL_CLOSED") return [];

  const reasons = new Set<string>(row.reason_codes);
  if (!row.signature_valid) reasons.add("invalid_or_missing_signature");
  if (row.verification_status && row.verification_status !== "VERIFIED") {
    reasons.add(`verification_${row.verification_status.toLowerCase()}`);
  }
  if (
    row.commercial_eligibility_status &&
    row.commercial_eligibility_status !== "VERIFIED"
  ) {
    reasons.add(
      `commercial_${row.commercial_eligibility_status.toLowerCase()}`,
    );
  }
  if (row.decision_readiness && row.decision_readiness !== "READY") {
    reasons.add(`decision_readiness_${row.decision_readiness.toLowerCase()}`);
  }
  if (reasons.size === 0) reasons.add("canonical_refresh_failed_closed");
  return [...reasons].sort();
}

async function refreshCountry(
  country: Awaited<ReturnType<typeof loadEnabledSovereigns>>[number],
  asOf: string,
) {
  try {
    const result = await publishCountryRiskObject({
      country_iso3: country.iso3,
      as_of: asOf,
      delivery_profile: "CANONICAL",
    });
    const object = result.object;
    const signature = verifyRiskObjectSignature(object);
    const commercial = verifyCommercialRiskObjectArtifact(object, {
      now: new Date(asOf),
    });
    const expiresAt = Date.parse(object.expires_at);
    const fresh = Number.isFinite(expiresAt) && expiresAt > Date.parse(asOf);
    const paidReady =
      result.context.published === true &&
      signature.valid === true &&
      fresh &&
      commercial.deliverable === true;

    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      status: paidReady ? "PAID_READY" : "FAIL_CLOSED",
      object_id: object.object_id,
      generated_at: object.generated_at,
      expires_at: object.expires_at,
      risk_label: object.risk.label,
      confidence: object.confidence,
      decision_readiness: object.decision_readiness.status,
      verification_status: object.verification.status,
      commercial_eligibility_status: object.commercial_eligibility.status,
      signature_valid: signature.valid,
      payload_hash: object.integrity.payload_hash,
      calculation_hash: object.integrity.calculation_hash,
      commercial_policy_version: commercial.policy_version,
      reason_codes: commercial.reason_codes,
      error_code: null,
    } as const;
  } catch (error) {
    console.error(
      `GLOBAL_CANONICAL_COUNTRY_FAIL ${country.iso3} ${
        error instanceof Error ? error.name : "UnknownError"
      }`,
    );
    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      status: "FAIL_CLOSED" as const,
      object_id: null,
      generated_at: null,
      expires_at: null,
      risk_label: null,
      confidence: null,
      decision_readiness: null,
      verification_status: null,
      commercial_eligibility_status: null,
      signature_valid: false,
      payload_hash: null,
      calculation_hash: null,
      commercial_policy_version: null,
      reason_codes: ["canonical_refresh_failed_closed"],
      error_code: "canonical_refresh_failed_closed",
    };
  }
}

async function main() {
  if (!Number.isFinite(CONCURRENCY) || !Number.isFinite(MIN_READY)) {
    throw new Error("Global canonical refresh numeric configuration is invalid");
  }

  const startedAt = new Date();
  const asOf = startedAt.toISOString();
  const countries = await loadEnabledSovereigns();

  if (countries.length < MIN_SOVEREIGN_DENOMINATOR) {
    throw new Error(
      `Enabled sovereign denominator regression: ${countries.length} < ${MIN_SOVEREIGN_DENOMINATOR}`,
    );
  }

  const results = new Array<Awaited<ReturnType<typeof refreshCountry>>>(countries.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      results[index] = await refreshCountry(countries[index], asOf);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const normalizedResults = results.map((row) => ({
    ...row,
    reason_codes: normalizeFailureReasons(row),
  }));
  const paidReady = normalizedResults.filter((row) => row.status === "PAID_READY");
  const failClosed = normalizedResults.filter((row) => row.status === "FAIL_CLOSED");
  const completedAt = new Date().toISOString();

  const reasonCounts = new Map<string, number>();
  const regionCounts = new Map<
    string,
    { total: number; paid_ready: number; fail_closed: number }
  >();

  for (const row of normalizedResults) {
    const region = row.region || "UNSPECIFIED";
    const regionState = regionCounts.get(region) ?? {
      total: 0,
      paid_ready: 0,
      fail_closed: 0,
    };
    regionState.total += 1;
    if (row.status === "PAID_READY") regionState.paid_ready += 1;
    else regionState.fail_closed += 1;
    regionCounts.set(region, regionState);

    if (row.status === "FAIL_CLOSED") {
      for (const reason of row.reason_codes) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }
  }

  const report = {
    schema_version: "geomacro-global-canonical-refresh-v1",
    delivery_profile: "CANONICAL",
    generated_at: asOf,
    completed_at: completedAt,
    denominator: {
      type: "enabled_sovereign_countries",
      count: countries.length,
    },
    summary: {
      paid_ready_country_count: paidReady.length,
      fail_closed_country_count: failClosed.length,
      paid_ready_pct: Number(((paidReady.length / countries.length) * 100).toFixed(2)),
      minimum_ready_gate: MIN_READY,
      ready_floor_met: paidReady.length >= MIN_READY,
    },
    failure_summary: {
      reason_counts: Object.fromEntries(
        [...reasonCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      region_counts: Object.fromEntries(
        [...regionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
    },
    boundaries: {
      all_enabled_sovereigns_evaluated: normalizedResults.length === countries.length,
      unsupported_or_ineligible_fail_closed: true,
      payment_not_performed_by_refresh: true,
      raw_source_material_emitted: false,
      execution_authorized: false,
      raw_exception_messages_emitted: false,
    },
    countries: normalizedResults,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = String(process.env.GLOBAL_CANONICAL_REFRESH_OUTPUT ?? "").trim();
  if (output) await Bun.write(output, json);
  console.log(json);

  if (paidReady.length < MIN_READY) {
    console.error(
      `GLOBAL_CANONICAL_READY_FLOOR_BREACH: ${paidReady.length} < ${MIN_READY}`,
    );
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

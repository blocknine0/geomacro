import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import {
  dryRunCountryRiskObject,
  getCanonicalBatchPreservedCommercialRiskObject,
  primeCanonicalBatchPreviousRiskObjects,
  publishCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";
import { verifyCommercialRiskObjectArtifact } from "../src/lib/commercial-risk-object-policy";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";
import { createGriDbClient } from "./lib/gri-db-client.mjs";

const CONCURRENCY = Math.max(
  1,
  Math.min(12, Number(process.env.GLOBAL_CANONICAL_REFRESH_CONCURRENCY ?? 6)),
);
const MIN_READY = Math.max(
  0,
  Number(process.env.GLOBAL_CANONICAL_MIN_READY ?? 195),
);
const MIN_COUNTRY_LIKE_DENOMINATOR = Math.max(
  1,
  Number(
    process.env.GLOBAL_CANONICAL_MIN_COUNTRY_LIKE_DENOMINATOR ??
      process.env.GLOBAL_CANONICAL_MIN_SOVEREIGN_DENOMINATOR ??
      195,
  ),
);

const COUNTRY_LIKE_SPECIALS = new Set(["PSE", "TWN"]);

function isCommercialCountryLikeSubject(iso3: string) {
  const scope = classifyGlobalEntity(iso3);
  return scope === "SOVEREIGN" || COUNTRY_LIKE_SPECIALS.has(iso3);
}

async function loadEnabledCommercialCountrySubjects() {
  const db = createGriDbClient();
  const result = await db
    .from("live_country_registry")
    .select("iso3,country_name")
    .eq("enabled", true)
    .order("iso3", { ascending: true });

  if (result.error) {
    throw new Error(
      `GLOBAL_COUNTRY_REGISTRY_READ_FAILED:${String(result.error.message ?? "unknown")}`,
    );
  }

  return (result.data ?? [])
    .map((row: { iso3?: unknown; country_name?: unknown }) => ({
      iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      country_name: String(row.country_name ?? "").trim(),
      region: null,
      subregion: null,
    }))
    .filter(
      (row) =>
        /^[A-Z]{3}$/.test(row.iso3) &&
        isCommercialCountryLikeSubject(row.iso3),
    );
}

function normalizeFailureReasons(row: {
  status: "PAID_READY" | "FAIL_CLOSED";
  reason_codes: readonly string[];
  verification_status: string | null;
  commercial_eligibility_status: string | null;
  decision_readiness: string | null;
  signature_valid: boolean | null;
}) {
  if (row.status !== "FAIL_CLOSED") return [];

  const reasons = new Set<string>(row.reason_codes);
  if (row.signature_valid === false) reasons.add("invalid_or_missing_signature");
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
  country: Awaited<ReturnType<typeof loadEnabledCommercialCountrySubjects>>[number],
  asOf: string,
) {
  try {
    // Calculate first without issuer signing or persistence. If current
    // evidence is insufficient, do not create a newly signed UNVERIFIED GRO
    // merely to discover that it cannot be sold.
    const preview = await dryRunCountryRiskObject({
      country_iso3: country.iso3,
      as_of: asOf,
      delivery_profile: "CANONICAL",
    });
    const previewObject = preview.object;
    const previewReady =
      previewObject.verification.status === "VERIFIED" &&
      previewObject.commercial_eligibility.status === "VERIFIED";

    if (!previewReady) {
      // Continuity may use only an already-signed, still-unexpired,
      // cryptographically valid and commercially VERIFIED canonical GRO.
      // No timestamps, hashes, signatures or evidence claims are changed.
      const preserved = getCanonicalBatchPreservedCommercialRiskObject(
        country.iso3,
        asOf,
      );

      if (preserved) {
        const signature = verifyRiskObjectSignature(preserved);
        const commercial = verifyCommercialRiskObjectArtifact(preserved, {
          now: new Date(asOf),
        });
        const expiresAt = Date.parse(preserved.expires_at);
        const fresh =
          Number.isFinite(expiresAt) &&
          expiresAt > Date.parse(asOf);

        if (!signature.valid || !fresh || !commercial.deliverable) {
          throw new Error("CANONICAL_PRESERVED_GRO_REVALIDATION_FAILED");
        }

        return {
          iso3: country.iso3,
          country_name: country.country_name,
          region: country.region,
          subregion: country.subregion,
          status: "PAID_READY" as const,
          object_id: preserved.object_id,
          generated_at: preserved.generated_at,
          expires_at: preserved.expires_at,
          risk_label: preserved.risk.label,
          confidence: preserved.confidence,
          decision_readiness: preserved.decision_readiness.status,
          verification_status: preserved.verification.status,
          commercial_eligibility_status: preserved.commercial_eligibility.status,
          signature_valid: true,
          payload_hash: preserved.integrity.payload_hash,
          calculation_hash: preserved.integrity.calculation_hash,
          commercial_policy_version: commercial.policy_version,
          reason_codes: commercial.reason_codes,
          diagnostics: {
            recent_events_loaded: preview.context.recent_events_loaded,
            country_events_used: preview.context.country_events_used,
            evidence_event_count: preserved.evidence_summary.event_count,
            evidence_count: preserved.evidence_summary.evidence_count,
            independent_source_count:
              preserved.evidence_summary.independent_source_count,
            embedded_commercial_reason_codes:
              preserved.commercial_eligibility.reason_codes,
            embedded_verification_reason_codes:
              preserved.verification.reason_codes,
            previous_baseline_status: preview.context.previous_baseline_status,
            publication_mode: "preserved_verified_fresh_previous",
            fresh_generation_published: false,
            preserved_object_unchanged: true,
            preview_verification_status: previewObject.verification.status,
            preview_commercial_eligibility_status:
              previewObject.commercial_eligibility.status,
          },
          error_code: null,
        } as const;
      }

      return {
        iso3: country.iso3,
        country_name: country.country_name,
        region: country.region,
        subregion: country.subregion,
        status: "FAIL_CLOSED" as const,
        object_id: null,
        generated_at: null,
        expires_at: null,
        risk_label: previewObject.risk.label,
        confidence: previewObject.confidence,
        decision_readiness: previewObject.decision_readiness.status,
        verification_status: previewObject.verification.status,
        commercial_eligibility_status:
          previewObject.commercial_eligibility.status,
        signature_valid: null,
        payload_hash: null,
        calculation_hash: previewObject.integrity.calculation_hash,
        commercial_policy_version: null,
        reason_codes: [
          "fresh_generation_not_commercially_verified",
          ...previewObject.commercial_eligibility.reason_codes,
          ...previewObject.verification.reason_codes,
        ],
        diagnostics: {
          recent_events_loaded: preview.context.recent_events_loaded,
          country_events_used: preview.context.country_events_used,
          evidence_event_count: previewObject.evidence_summary.event_count,
          evidence_count: previewObject.evidence_summary.evidence_count,
          independent_source_count:
            previewObject.evidence_summary.independent_source_count,
          embedded_commercial_reason_codes:
            previewObject.commercial_eligibility.reason_codes,
          embedded_verification_reason_codes:
            previewObject.verification.reason_codes,
          previous_baseline_status: preview.context.previous_baseline_status,
          publication_mode: "fail_closed_unsigned_preview",
          fresh_generation_published: false,
          preserved_object_unchanged: null,
          preview_verification_status: previewObject.verification.status,
          preview_commercial_eligibility_status:
            previewObject.commercial_eligibility.status,
        },
        error_code: "fresh_generation_not_commercially_verified",
      } as const;
    }

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
      diagnostics: {
        recent_events_loaded: result.context.recent_events_loaded,
        country_events_used: result.context.country_events_used,
        evidence_event_count: object.evidence_summary.event_count,
        evidence_count: object.evidence_summary.evidence_count,
        independent_source_count: object.evidence_summary.independent_source_count,
        embedded_commercial_reason_codes: object.commercial_eligibility.reason_codes,
        embedded_verification_reason_codes: object.verification.reason_codes,
        previous_baseline_status: result.context.previous_baseline_status,
        publication_mode: "new_verified_canonical",
        fresh_generation_published: true,
        preserved_object_unchanged: null,
        preview_verification_status: previewObject.verification.status,
        preview_commercial_eligibility_status:
          previewObject.commercial_eligibility.status,
      },
      error_code: paidReady ? null : "published_object_not_commercially_deliverable",
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
      diagnostics: {
        recent_events_loaded: null,
        country_events_used: null,
        evidence_event_count: null,
        evidence_count: null,
        independent_source_count: null,
        embedded_commercial_reason_codes: [] as string[],
        embedded_verification_reason_codes: [] as string[],
        previous_baseline_status: null,
        publication_mode: "exception_fail_closed",
        fresh_generation_published: false,
        preserved_object_unchanged: null,
        preview_verification_status: null,
        preview_commercial_eligibility_status: null,
      },
      error_code: "canonical_refresh_failed_closed",
    } as const;
  }
}

async function main() {
  // This process evaluates one frozen as_of for every sovereign. Allow only
  // this bounded batch to reuse identical reads; web requests remain uncached.
  process.env.GEOMACRO_CANONICAL_BATCH = "1";
  if (
    !Number.isFinite(CONCURRENCY) ||
    !Number.isFinite(MIN_READY) ||
    !Number.isFinite(MIN_COUNTRY_LIKE_DENOMINATOR)
  ) {
    throw new Error("Global canonical refresh numeric configuration is invalid");
  }

  const startedAt = new Date();
  const asOf = startedAt.toISOString();
  const countries = await loadEnabledCommercialCountrySubjects();

  if (countries.length < MIN_COUNTRY_LIKE_DENOMINATOR) {
    throw new Error(
      `Enabled country-like denominator regression: ${countries.length} < ${MIN_COUNTRY_LIKE_DENOMINATOR}`,
    );
  }

  const baselinePrime = await primeCanonicalBatchPreviousRiskObjects(asOf);
  console.log(JSON.stringify({
    schema: "geomacro.canonical-batch-baseline-prime.v1",
    hot_previous_objects_loaded: baselinePrime.loaded,
    hot_previous_rows_scanned: baselinePrime.scanned,
    preserved_commercial_fresh_objects_loaded:
      baselinePrime.preservedCommercialLoaded,
    preserved_commercial_fresh_rows_scanned:
      baselinePrime.preservedCommercialScanned,
    b2_archive_reads_for_previous_baseline: 0,
  }));

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
  const newlyGeneratedReady = paidReady.filter(
    (row) => row.diagnostics.publication_mode === "new_verified_canonical",
  );
  const preservedVerifiedFresh = paidReady.filter(
    (row) =>
      row.diagnostics.publication_mode ===
      "preserved_verified_fresh_previous",
  );
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
      type: "enabled_country_like_entities",
      count: countries.length,
      sovereign_count: countries.filter(
        (row) => classifyGlobalEntity(row.iso3) === "SOVEREIGN",
      ).length,
      special_country_like_count: countries.filter((row) =>
        COUNTRY_LIKE_SPECIALS.has(row.iso3),
      ).length,
      special_country_like_iso3: [...COUNTRY_LIKE_SPECIALS].sort(),
    },
    summary: {
      paid_ready_country_count: paidReady.length,
      newly_generated_paid_ready_count: newlyGeneratedReady.length,
      preserved_verified_fresh_count: preservedVerifiedFresh.length,
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
      all_enabled_sovereigns_evaluated:
        normalizedResults.filter(
          (row) => classifyGlobalEntity(row.iso3) === "SOVEREIGN",
        ).length ===
        countries.filter(
          (row) => classifyGlobalEntity(row.iso3) === "SOVEREIGN",
        ).length,
      all_enabled_country_like_subjects_evaluated:
        normalizedResults.length === countries.length,
      unsupported_or_ineligible_fail_closed: true,
      payment_not_performed_by_refresh: true,
      raw_source_material_emitted: false,
      execution_authorized: false,
      raw_exception_messages_emitted: false,
      unverified_objects_signed_for_gap_fill: false,
      preserved_objects_retimestamped: false,
    },
    countries: normalizedResults,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const output = String(process.env.GLOBAL_CANONICAL_REFRESH_OUTPUT ?? "").trim();
  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, json, "utf8");
  }
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

#!/usr/bin/env node
/**
 * Read-only published three-endpoint intelligence proof.
 * No customer questions, no POST, no PAYMENT-SIGNATURE, no settlement,
 * no raw source payload/title/provider URLs in outputs or CI artifacts.
 * Verifies exact deployed SHA BEFORE the three bounded official feed GETs.
 */
const base = String(process.env.GEOMACRO_BASE_URL || "https://geomacro.live").replace(/\/$/u, "");
const expectedSha = String(process.env.EXPECTED_CANONICAL_SHA || "").trim().toLowerCase();
const categories = ["geopolitics", "macro-fx", "critical-minerals"];
const okSha = value => /^[a-f0-9]{40}$/u.test(value);
const result = {
  schema: "geomacro.three-category-live-api-exact-sha-no-funds.v1",
  checked_at: new Date().toISOString(),
  expected_sha: expectedSha,
  deployed_sha: null,
  exact_deployment: false,
  payment_or_settlement_performed: false,
  request_method: "GET",
  raw_source_data_logged: false,
  categories: [],
  all_three_endpoints_live: false,
  all_three_current_release_finding: false,
};
async function getJson(url, timeoutMs) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
  });
  if (Number(response.headers.get("content-length") || 0) > 60_000)
    return { status: response.status, data: null };
  const raw = await response.text();
  if (raw.length > 60_000) return { status: response.status, data: null };
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  return { status: response.status, data };
}
try {
  const marker = await getJson(base + "/.well-known/geomacro-build.json", 9_000);
  const observed = String(marker.data?.canonical_main_sha || "").toLowerCase();
  result.deployed_sha = okSha(observed) ? observed : null;
  result.exact_deployment = marker.status === 200 &&
    okSha(expectedSha) && result.deployed_sha === expectedSha;
} catch {}
if (!result.exact_deployment) {
  result.status = "PUBLISHED_BUILD_SHA_MISMATCH_OR_UNAVAILABLE";
} else {
  result.categories = await Promise.all(categories.map(async category => {
    try {
      const response = await getJson(
        base + "/api/v1/intelligence/" + category + "?view=latest", 20_000
      );
      const body = response.data;
      const findings = Array.isArray(body?.findings) ? body.findings : [];
      const originalClockSafe = findings.every(row => {
        const ts = Date.parse(String(row?.published_at || ""));
        const elapsed = Date.now() - ts;
        return Number.isFinite(ts) && elapsed >= 0 &&
          elapsed <= 24 * 3600_000 && row?.risk_score === null &&
          row?.same_event_corroborated === false &&
          row?.evidence_class === "original_publisher_release_unscored";
      });
      const provenanceSafe = !/(?:https?:\/\/|www\.)/iu.test(JSON.stringify(body?.findings || []));
      const valid = response.status === 200 &&
        body?.schema_version === "geomacro.category-live-official-observation.v1" &&
        body?.category === category &&
        body?.ok === true &&
        body?.observation_mode === "UNSCORED_OFFICIAL_RELEASES" &&
        ["CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE",
          "NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H"].includes(body?.status) &&
        findings.length <= 3 &&
        originalClockSafe && provenanceSafe &&
        body?.signed_gro_generated === false &&
        body?.current_signed_risk_intelligence_verified === false &&
        body?.x402_payment_required === false &&
        body?.paid_delivery_authorized_by_observations === false &&
        body?.source_urls_disclosed === false &&
        body?.raw_publisher_content_delivered === false &&
        body?.durable_storage_written === false;
      return {
        category, http: response.status, ok: valid,
        status: valid ? body.status : "OBSERVATION_CONTRACT_UNAVAILABLE",
        finding_count: valid ? findings.length : 0,
        fresh_original_evidence_proven: valid && findings.length > 0,
      };
    } catch(error) {
      return {
        category, http: 0, ok: false, finding_count: 0,
        status: error?.name === "TimeoutError" ? "CATEGORY_GET_TIMEOUT" : "CATEGORY_GET_UNAVAILABLE",
        fresh_original_evidence_proven: false,
      };
    }
  }));
  result.all_three_endpoints_live =
    result.categories.length === 3 && result.categories.every(x => x.ok);
  result.all_three_current_release_finding =
    result.all_three_endpoints_live && result.categories.every(x => x.finding_count >= 1);
  result.status = result.all_three_endpoints_live
    ? "THREE_CATEGORY_READ_ONLY_API_ACCEPTED"
    : "ONE_OR_MORE_CATEGORY_READBACK_FAILED";
}
console.log(JSON.stringify(result, null, 2));
if (!result.all_three_endpoints_live) {
  console.error("GEOMACRO_THREE_CATEGORY_LIVE_API_UNVERIFIED_NO_FUNDS");
  process.exitCode = 2;
}

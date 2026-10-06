#!/usr/bin/env node

const BASE_URL = "https://geomacro.live";
const EXPECTED_AUTHORITY = "backblaze-b2-verified-edge";
const MAX_ATTEMPTS = 18;
const POLL_MS = 10_000;

const expectedRaw = String(process.env.GEOMACRO_EXPECTED_GLOBAL_RISK_SNAPSHOT_AS_OF ?? "").trim();
const expectedMs = Date.parse(expectedRaw);
if (!Number.isFinite(expectedMs)) {
  throw new Error("GLOBAL_RISK_EXPECTED_SNAPSHOT_AS_OF_REQUIRED");
}

function validContinuity(body) {
  const data = body?.data;
  const series7 = data?.series?.["7D"]?.buckets;
  const series30 = data?.series?.["30D"]?.buckets;
  const servedMs = Date.parse(String(data?.snapshotAsOf ?? ""));
  return {
    ok:
      body?.ok === true &&
      body?.meta?.authority === EXPECTED_AUTHORITY &&
      data?.verificationStatus === "verified" &&
      Array.isArray(series7) &&
      series7.length >= 2 &&
      Array.isArray(series30) &&
      series30.length >= series7.length &&
      Number.isFinite(servedMs) &&
      servedMs >= expectedMs,
    servedMs,
    snapshotAsOf: data?.snapshotAsOf ?? null,
    sevenDayBuckets: Array.isArray(series7) ? series7.length : 0,
    thirtyDayBuckets: Array.isArray(series30) ? series30.length : 0,
    authority: body?.meta?.authority ?? null,
    verificationStatus: data?.verificationStatus ?? null,
  };
}

let last = null;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const nonce = `${Date.now()}-${process.pid}-${attempt}`;
  try {
    const response = await fetch(`${BASE_URL}/api/public/global-risk?production_convergence=${encodeURIComponent(nonce)}`, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "Geomacro-Global-Risk-Convergence/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      const body = await response.json();
      const check = validContinuity(body);
      last = {
        attempt,
        http_status: response.status,
        expected_snapshot_as_of: expectedRaw,
        served_snapshot_as_of: check.snapshotAsOf,
        authority: check.authority,
        verification_status: check.verificationStatus,
        seven_day_buckets: check.sevenDayBuckets,
        thirty_day_buckets: check.thirtyDayBuckets,
        cache_control: response.headers.get("cache-control"),
        age: response.headers.get("age"),
        cf_cache_status: response.headers.get("cf-cache-status"),
      };
      if (check.ok) {
        console.log(JSON.stringify({
          ok: true,
          schema: "geomacro.global-risk-public-convergence.v1",
          ...last,
          expected_snapshot_visible: true,
          raw_history_serialized: false,
        }));
        process.exit(0);
      }
    } else {
      last = { attempt, http_status: response.status, expected_snapshot_as_of: expectedRaw };
    }
  } catch (error) {
    last = {
      attempt,
      expected_snapshot_as_of: expectedRaw,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(JSON.stringify({
    ok: false,
    schema: "geomacro.global-risk-public-convergence-attempt.v1",
    ...last,
    expected_snapshot_visible: false,
  }));
  if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

throw new Error(`GLOBAL_RISK_PUBLIC_CONVERGENCE_FAILED:${JSON.stringify(last)}`);

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const PUBLIC_URL = "https://geomacro.live/api/public/intelligence";
const PUBLISHER = "scripts/ops/run-b2-public-intelligence-publisher.mjs";
const PRESERVE_LIVE_REPUBLISHER = "scripts/ops/republish-b2-public-intelligence-preserve-live.mjs";
const SCORED_ONLY_REPUBLISHER = "scripts/ops/republish-b2-public-intelligence-scored-only.mjs";
const ARTIFACT = "artifacts/intelligence-fastlane-publication.json";
const POLL_MS = 10_000;
const MAX_POLLS = 18;
const FASTLANE_GDELT_WAIT_MS = 30_000;
const GDELT_COVERAGE_SOURCE_ID = "gdelt_v2_events";
const GDELT_COVERAGE_TARGET_PREFIX = "GEO:COVERAGE_FALLBACK:";
const GDELT_COVERAGE_MAINTENANCE_MAX_AGE_MS = Number(
  process.env.GDELT_COVERAGE_MAINTENANCE_MAX_AGE_MS || 95 * 60 * 1000,
);

function eventTime(row) {
  const value = row?.published_at ?? row?.created_at;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function isoOrNull(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

async function latestCanonicalScored() {
  const db = createGriDbClient();
  const latest = {};
  for (const category of CATEGORIES) {
    const { data, error } = await db
      .from("events")
      .select("id,category,severity,classification_version,published_at,created_at")
      .eq("category", category)
      .eq("classification_version", CLASSIFICATION_VERSION)
      .order("published_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`FASTLANE_PUBLICATION_DB_READ_FAILED:${category}:${error.message}`);
    const row = data?.[0] ?? null;
    const severity = Number(row?.severity);
    const timestamp = eventTime(row);
    if (!row || !Number.isFinite(severity) || severity < 0 || severity > 100 || !Number.isFinite(timestamp)) {
      throw new Error(`FASTLANE_PUBLICATION_CANONICAL_SCORE_INVALID:${category}`);
    }
    latest[category] = timestamp;
  }
  return latest;
}

async function gdeltCoverageMaintenanceStatus() {
  const db = createGriDbClient();
  const [registryResult, targetsResult] = await Promise.all([
    db
      .from("live_country_registry")
      .select("iso3")
      .eq("enabled", true),
    db
      .from("live_raw_source_targets")
      .select("target_id,country_iso3,last_success_at")
      .eq("enabled", true)
      .eq("category", "GEOPOLITICS")
      .eq("transport", "GLOBAL_FALLBACK")
      .eq("source_id", GDELT_COVERAGE_SOURCE_ID),
  ]);
  if (registryResult.error) {
    throw new Error(`FASTLANE_COVERAGE_COUNTRY_READ_FAILED:${registryResult.error.message}`);
  }
  if (targetsResult.error) {
    throw new Error(`FASTLANE_COVERAGE_TARGET_READ_FAILED:${targetsResult.error.message}`);
  }

  const expectedCountries = new Set((registryResult.data ?? []).map((row) => String(row.iso3 ?? "")));
  const targets = (targetsResult.data ?? []).filter((row) =>
    String(row.target_id ?? "").startsWith(GDELT_COVERAGE_TARGET_PREFIX) &&
    expectedCountries.has(String(row.country_iso3 ?? ""))
  );

  let oldestSuccessMs = Infinity;
  let malformedRows = 0;
  for (const row of targets) {
    const parsed = Date.parse(String(row.last_success_at ?? ""));
    if (!Number.isFinite(parsed)) {
      malformedRows += 1;
      continue;
    }
    oldestSuccessMs = Math.min(oldestSuccessMs, parsed);
  }

  const censusComplete =
    expectedCountries.size > 0 &&
    targets.length === expectedCountries.size &&
    malformedRows === 0;
  const ageMs = Number.isFinite(oldestSuccessMs) ? Date.now() - oldestSuccessMs : Infinity;
  const maintenanceRequired =
    !censusComplete ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs >= GDELT_COVERAGE_MAINTENANCE_MAX_AGE_MS;

  return {
    source_id: GDELT_COVERAGE_SOURCE_ID,
    expected_country_count: expectedCountries.size,
    target_count: targets.length,
    malformed_rows: malformedRows,
    oldest_success_at: Number.isFinite(oldestSuccessMs) ? new Date(oldestSuccessMs).toISOString() : null,
    age_ms: Number.isFinite(ageMs) ? ageMs : null,
    max_age_ms: GDELT_COVERAGE_MAINTENANCE_MAX_AGE_MS,
    census_complete: censusComplete,
    maintenance_required: maintenanceRequired,
  };
}

function publicLatestByCategory(body) {
  const latest = Object.fromEntries(CATEGORIES.map((category) => [category, -Infinity]));
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  for (const row of rows) {
    if (row?.public_status !== "verified_b2") continue;
    const category = String(row?.category ?? "");
    if (!CATEGORIES.includes(category)) continue;
    const severity = Number(row?.severity);
    const timestamp = eventTime(row);
    if (!Number.isFinite(severity) || severity < 0 || severity > 100 || !Number.isFinite(timestamp)) continue;
    latest[category] = Math.max(latest[category], timestamp);
  }
  return latest;
}

function caughtUp(publicLatest, canonicalLatest) {
  return CATEGORIES.every((category) =>
    Number.isFinite(publicLatest?.[category]) && publicLatest[category] >= canonicalLatest[category]
  );
}

function validPublicMode(body) {
  const mode = body?.mode;
  const live = Number(body?.live_observed_rows ?? 0);
  if (mode === "verified_b2") return live === 0;
  if (mode === "verified_b2_plus_live_observed") return live >= 1;
  return false;
}

async function fetchPublic(attempt) {
  const nonce = `${Date.now()}-${process.pid}-${attempt}`;
  const response = await fetch(`${PUBLIC_URL}?fastlane_publication=${encodeURIComponent(nonce)}`, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "Geomacro-Fastlane-Publication-Sync/1.0",
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`FASTLANE_PUBLICATION_PUBLIC_HTTP_${response.status}`);
  const body = await response.json();
  if (body?.ok !== true || !validPublicMode(body)) {
    throw new Error(`FASTLANE_PUBLICATION_PUBLIC_MODE_INVALID:${String(body?.mode ?? "missing")}`);
  }
  return {
    mode: body.mode,
    verified_rows: Number(body?.verified_rows ?? 0),
    live_observed_rows: Number(body?.live_observed_rows ?? 0),
    current_within_24h: body?.current_within_24h === true,
    newest_at: body?.newest_at ?? null,
    latest_scored_by_category: publicLatestByCategory(body),
  };
}

function writeProof({
  canonicalLatest,
  before,
  after,
  publisherInvoked,
  publisherAttempts,
  publicationMode,
  coverageMaintenanceBefore = null,
  coverageMaintenanceAfter = null,
}) {
  mkdirSync("artifacts", { recursive: true });
  const proof = {
    schema: "geomacro.fastlane-scored-publication.v1",
    ok: true,
    classification_version: CLASSIFICATION_VERSION,
    categories: CATEGORIES,
    canonical_latest_scored_at: Object.fromEntries(
      CATEGORIES.map((category) => [category, isoOrNull(canonicalLatest[category])]),
    ),
    public_before: before ? {
      mode: before.mode,
      latest_scored_at: Object.fromEntries(
        CATEGORIES.map((category) => [category, isoOrNull(before.latest_scored_by_category[category])]),
      ),
    } : null,
    public_after: after ? {
      mode: after.mode,
      verified_rows: after.verified_rows,
      live_observed_rows: after.live_observed_rows,
      current_within_24h: after.current_within_24h,
      newest_at: after.newest_at,
      latest_scored_at: Object.fromEntries(
        CATEGORIES.map((category) => [category, isoOrNull(after.latest_scored_by_category[category])]),
      ),
    } : null,
    publisher_invoked: publisherInvoked,
    publisher_attempts: publisherAttempts,
    publication_mode: publicationMode,
    coverage_maintenance_before: coverageMaintenanceBefore,
    coverage_maintenance_after: coverageMaintenanceAfter,
    raw_rows_serialized: false,
    completed_at: new Date().toISOString(),
  };
  writeFileSync(ARTIFACT, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof));
}

function runRepublisher(script, timeout) {
  const child = spawnSync("node", [script], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    timeout,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  return child;
}

function runScoredOnlyRepublisher() {
  const child = runRepublisher(SCORED_ONLY_REPUBLISHER, 120_000);
  if (child.status !== 0) {
    throw new Error(`FASTLANE_PUBLICATION_SCORED_ONLY_FAILED:${child.status ?? "unknown"}`);
  }
}

const canonicalLatest = await latestCanonicalScored();
let before = null;
try {
  before = await fetchPublic(0);
} catch (error) {
  console.warn(`FASTLANE_PUBLICATION_PRECHECK_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
}

let coverageMaintenanceBefore = null;
if (before && caughtUp(before.latest_scored_by_category, canonicalLatest)) {
  coverageMaintenanceBefore = await gdeltCoverageMaintenanceStatus();
  if (!coverageMaintenanceBefore.maintenance_required) {
    writeProof({
      canonicalLatest,
      before,
      after: before,
      publisherInvoked: false,
      publisherAttempts: 0,
      publicationMode: "already_caught_up_coverage_fresh",
      coverageMaintenanceBefore,
      coverageMaintenanceAfter: coverageMaintenanceBefore,
    });
    process.exit(0);
  }

  console.warn(
    `FASTLANE_PUBLICATION_COVERAGE_MAINTENANCE_REQUIRED:${coverageMaintenanceBefore.oldest_success_at ?? "missing"}`,
  );
}

const publishEnv = {
  ...process.env,
  GDELT_MAX_AVAILABILITY_WAIT_MS: String(FASTLANE_GDELT_WAIT_MS),
};
let publish = spawnSync("node", [PUBLISHER], {
  encoding: "utf8",
  env: publishEnv,
  maxBuffer: 32 * 1024 * 1024,
  timeout: 60_000,
});
if (publish.stdout) process.stdout.write(publish.stdout);
if (publish.stderr) process.stderr.write(publish.stderr);
if (publish.error) throw publish.error;

let publicationMode = "fresh_gdelt_plus_scored";
const initialCombined = `${publish.stdout ?? ""}\n${publish.stderr ?? ""}`;
if (publish.status !== 0) {
  if (!initialCombined.includes("CURRENT_GDELT_AVAILABILITY_WAIT_EXHAUSTED")) {
    throw new Error(`FASTLANE_PUBLICATION_B2_PUBLISH_FAILED:${publish.status ?? "unknown"}`);
  }

  if (before?.mode === "verified_b2" && before.live_observed_rows === 0) {
    console.warn("FASTLANE_PUBLICATION_GDELT_UNAVAILABLE_REPUBLISHING_FRESH_SCORED_ONLY");
    runScoredOnlyRepublisher();
    publicationMode = "fresh_scored_only_no_current_live_export";
  } else {
    console.warn("FASTLANE_PUBLICATION_GDELT_UNAVAILABLE_USING_VERIFIED_LIVE_PRESERVATION");
    const preserved = runRepublisher(PRESERVE_LIVE_REPUBLISHER, 120_000);
    if (preserved.status === 0) {
      publicationMode = "preserved_verified_live_plus_fresh_scored";
    } else {
      const preserveCombined = `${preserved.stdout ?? ""}\n${preserved.stderr ?? ""}`;
      if (!preserveCombined.includes("FASTLANE_PRESERVE_CURRENT_SOURCE_STALE")) {
        throw new Error(`FASTLANE_PUBLICATION_PRESERVE_LIVE_FAILED:${preserved.status ?? "unknown"}`);
      }
      console.warn("FASTLANE_PUBLICATION_VERIFIED_LIVE_STALE_REPUBLISHING_FRESH_SCORED_ONLY");
      runScoredOnlyRepublisher();
      publicationMode = "fresh_scored_only_no_current_live_export";
    }
  }
}

let publisherAttempts = 1;
for (const line of initialCombined.split(/\r?\n/u)) {
  try {
    const value = JSON.parse(line);
    if (value?.schema === "geomacro.public-intelligence-publisher-availability.v1") {
      publisherAttempts = Number(value?.attempts ?? 1);
    } else if (value?.retrying === true && Number.isFinite(Number(value?.attempt))) {
      publisherAttempts = Math.max(publisherAttempts, Number(value.attempt));
    }
  } catch {}
}

let after = null;
let lastError = null;
for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
  try {
    after = await fetchPublic(attempt);
    if (
      after.current_within_24h === true &&
      caughtUp(after.latest_scored_by_category, canonicalLatest)
    ) {
      const coverageMaintenanceAfter = await gdeltCoverageMaintenanceStatus();
      if (coverageMaintenanceBefore?.maintenance_required === true &&
          coverageMaintenanceAfter.maintenance_required === true) {
        throw new Error("FASTLANE_GDELT_COVERAGE_MAINTENANCE_UNSATISFIED");
      }
      writeProof({
        canonicalLatest,
        before,
        after,
        publisherInvoked: true,
        publisherAttempts,
        publicationMode,
        coverageMaintenanceBefore,
        coverageMaintenanceAfter,
      });
      process.exit(0);
    }
    lastError = new Error("FASTLANE_PUBLICATION_PUBLIC_SCORE_NOT_CAUGHT_UP");
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }
  if (attempt < MAX_POLLS) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

throw lastError ?? new Error("FASTLANE_PUBLICATION_PUBLIC_CONVERGENCE_FAILED");

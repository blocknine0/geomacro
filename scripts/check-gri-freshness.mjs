#!/usr/bin/env node

import process from "node:process";

const METHOD = process.env.GRI_METHOD_VERSION || "gri-v1.2.0";
const PROOF = process.env.GRI_PROOF_VERSION || "gri-proof-v1.2.0";
const MAX_AGE_HOURS = Number(process.env.GRI_WATCHDOG_MAX_AGE_HOURS || "1.5");
const FUTURE_TOLERANCE_MINUTES = 15;
const STALE_EXIT_CODE = 10;

function fail(message) {
  console.error(`[gri-freshness] ${message}`);
  process.exit(1);
}

if (!Number.isFinite(MAX_AGE_HOURS) || MAX_AGE_HOURS <= 0) {
  fail(`Invalid GRI_WATCHDOG_MAX_AGE_HOURS: ${process.env.GRI_WATCHDOG_MAX_AGE_HOURS}`);
}

const baseUrl = (process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY || "";

if (!baseUrl) fail("APP_SUPABASE_URL or SUPABASE_URL is required");
if (!/^https:\/\//i.test(baseUrl)) fail("Supabase URL must use HTTPS");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY or APP_SUPABASE_SERVICE_ROLE_KEY is required");

const params = new URLSearchParams({
  select: "id,as_of,methodology_version,proof_version,verification_status,status",
  status: "eq.published",
  methodology_version: `eq.${METHOD}`,
  proof_version: `eq.${PROOF}`,
  verification_status: "eq.verified",
  order: "as_of.desc",
  limit: "1",
});

const endpoint = `${baseUrl}/rest/v1/gri_snapshots?${params.toString()}`;

let response;
try {
  response = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
} catch (error) {
  fail(`Snapshot query failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (!response.ok) {
  const body = await response.text().catch(() => "");
  fail(`Snapshot query returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
}

const rows = await response.json();
if (!Array.isArray(rows)) fail("Snapshot query returned a non-array payload");

if (rows.length === 0) {
  console.log(JSON.stringify({
    fresh: false,
    reason: "NO_VERIFIED_CURRENT_SNAPSHOT",
    methodologyVersion: METHOD,
    proofVersion: PROOF,
    maxAgeHours: MAX_AGE_HOURS,
  }));
  process.exit(STALE_EXIT_CODE);
}

const latest = rows[0];
const asOfMs = Date.parse(String(latest.as_of || ""));
if (!Number.isFinite(asOfMs)) fail(`Latest snapshot has invalid as_of: ${latest.as_of}`);

const nowMs = Date.now();
const ageHours = (nowMs - asOfMs) / 3_600_000;
const futureToleranceHours = FUTURE_TOLERANCE_MINUTES / 60;

if (ageHours < -futureToleranceHours) {
  fail(`Latest verified snapshot is ${Math.abs(ageHours).toFixed(3)} hours in the future`);
}

const fresh = ageHours <= MAX_AGE_HOURS;
console.log(JSON.stringify({
  fresh,
  reason: fresh ? "WITHIN_WATCHDOG_WINDOW" : "VERIFIED_SNAPSHOT_STALE",
  snapshotId: latest.id,
  asOf: latest.as_of,
  ageHours: Number(ageHours.toFixed(4)),
  maxAgeHours: MAX_AGE_HOURS,
  methodologyVersion: latest.methodology_version,
  proofVersion: latest.proof_version,
  verificationStatus: latest.verification_status,
}));

process.exit(fresh ? 0 : STALE_EXIT_CODE);

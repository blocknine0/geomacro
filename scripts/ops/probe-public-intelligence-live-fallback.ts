#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { readProductionPublicIntelligence } from "../../src/lib/public-intelligence-production.server";

const DAY_MS = 24 * 60 * 60 * 1000;

// This probe intentionally runs without B2 credentials. It exercises the exact
// production public reader in live-observed-only mode, proving that current
// public Intelligence can remain fresh while the Supabase control plane is
// quota-restricted and while no durable B2 package is available to this job.
delete process.env.B2_KEY_ID;
delete process.env.B2_APPLICATION_KEY;

const payload = await readProductionPublicIntelligence();
const now = Date.now();
const observed = payload.rows.filter((row) => row.public_status === "live_observed");
const currentObserved = observed.filter((row) => {
  const raw = row.published_at ?? row.created_at;
  const at = Date.parse(String(raw ?? ""));
  return Number.isFinite(at) && at <= now + 5 * 60_000 && now - at <= DAY_MS;
});

if (payload.verified_rows !== 0 || payload.mode !== "live_observed_only") {
  throw new Error("LIVE_FALLBACK_PROBE_NOT_ISOLATED_FROM_DURABLE_SERVING");
}
if (observed.length === 0 || currentObserved.length === 0 || payload.current_within_24h !== true) {
  throw new Error("LIVE_FALLBACK_PROBE_HAS_NO_CURRENT_OBSERVATION");
}
if (observed.some((row) => row.severity !== null || row.delta !== null)) {
  throw new Error("LIVE_FALLBACK_PROBE_SYNTHETIC_SCORE_DETECTED");
}
if (observed.some((row) => row.public_status !== "live_observed")) {
  throw new Error("LIVE_FALLBACK_PROBE_STATUS_MISMATCH");
}

const categories = [...new Set(currentObserved.map((row) => String(row.category ?? "")).filter(Boolean))].sort();
const report = {
  ok: true,
  mode: payload.mode,
  current_within_24h: payload.current_within_24h,
  newest_at: payload.newest_at,
  live_observed_rows: observed.length,
  current_live_observed_rows: currentObserved.length,
  categories,
  generated_at: new Date().toISOString(),
  serving_note: "Ephemeral live-observed freshness only; no Supabase/B2 write and no synthetic score or delta.",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/public-intelligence-live-fallback.json",
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report));

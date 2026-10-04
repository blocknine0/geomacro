#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://geomacro.live/api/public/intelligence";
const REQUIRED = new Set(["geopolitics", "macro", "rare_earth"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const response = await fetch(ENDPOINT, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
const body = await response.json().catch(() => null);
const rows = Array.isArray(body?.rows) ? body.rows : [];
const scoredCategories = new Set<string>();
let verifiedRowsValid = true;
let liveRowsValid = true;
let verifiedCount = 0;
let liveCount = 0;
let newest = -Infinity;

for (const row of rows) {
  const category = String(row?.category ?? "");
  const title = String(row?.source_title ?? "");
  const status = String(row?.public_status ?? "");
  const published = Date.parse(String(row?.published_at ?? row?.created_at ?? ""));
  if (Number.isFinite(published)) newest = Math.max(newest, published);

  if (status === "verified_b2") {
    verifiedCount += 1;
    const severity = Number(row?.severity);
    if (
      !Number.isFinite(severity) ||
      severity < 0 ||
      severity > 100 ||
      !title.startsWith("Geomacro finds ") ||
      !REQUIRED.has(category)
    ) verifiedRowsValid = false;
    if (REQUIRED.has(category)) scoredCategories.add(category);
    continue;
  }

  if (status === "live_observed") {
    liveCount += 1;
    if (
      category !== "geopolitics" ||
      !title.startsWith("Geomacro observes ") ||
      row?.severity !== null ||
      row?.delta !== null ||
      !Number.isFinite(published) ||
      published > Date.now() + 5 * 60_000 ||
      Date.now() - published > DAY_MS
    ) liveRowsValid = false;
    continue;
  }

  verifiedRowsValid = false;
  liveRowsValid = false;
}

const threeDomain = [...REQUIRED].every((category) => scoredCategories.has(category));
const mode = body?.mode ?? null;
const modeValid =
  (mode === "verified_b2" && liveCount === 0 && Number(body?.live_observed_rows ?? 0) === 0) ||
  (mode === "verified_b2_plus_live_observed" && liveCount > 0 && Number(body?.live_observed_rows ?? 0) === liveCount);
const verifiedCountMatches = Number(body?.verified_rows ?? -1) === verifiedCount;
const currentWithin24h =
  Number.isFinite(newest) && newest <= Date.now() + 5 * 60_000 && Date.now() - newest <= DAY_MS;
const contractValid =
  response.ok &&
  body?.ok === true &&
  rows.length > 0 &&
  verifiedCount > 0 &&
  verifiedRowsValid &&
  liveRowsValid &&
  threeDomain &&
  modeValid &&
  verifiedCountMatches;

const report = {
  ok: contractValid,
  endpoint: ENDPOINT,
  http_status: response.status,
  mode,
  newest_at: body?.newest_at ?? (Number.isFinite(newest) ? new Date(newest).toISOString() : null),
  current_within_24h: body?.current_within_24h === true && currentWithin24h,
  verified_rows: verifiedCount,
  live_observed_rows: liveCount,
  categories: [...scoredCategories].sort(),
  invariants: {
    verified_scored_three_domain: verifiedRowsValid && threeDomain,
    live_observed_unscored: liveRowsValid,
    mode_counts_consistent: modeValid && verifiedCountMatches,
    raw_source_score_inference: false,
    synthetic_freshness: false,
    destructive_change: false,
  },
  generated_at: new Date().toISOString(),
  serving_note: liveCount > 0
    ? "Certified current observations are present and explicitly unscored alongside verified scored context."
    : body?.current_within_24h === true
      ? "Latest verified scored package is current."
      : "No newer verified result is available; the latest verified scored package remains authoritative while current evidence refresh is pending.",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/public-intelligence-live-fallback.json",
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report));

if (!contractValid) {
  throw new Error("PUBLIC_INTELLIGENCE_CONTINUITY_INVALID");
}

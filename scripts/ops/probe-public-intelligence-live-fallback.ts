#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://geomacro.live/api/public/intelligence";
const REQUIRED = new Set(["geopolitics", "macro", "rare_earth"]);

const response = await fetch(ENDPOINT, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
const body = await response.json().catch(() => null);
const rows = Array.isArray(body?.rows) ? body.rows : [];
const seen = new Set<string>();
let rowsValid = rows.length > 0;
for (const row of rows) {
  const severity = Number(row?.severity);
  const category = String(row?.category ?? "");
  const title = String(row?.source_title ?? "");
  if (!Number.isFinite(severity) || severity < 0 || severity > 100) rowsValid = false;
  if (row?.public_status !== "verified_b2") rowsValid = false;
  if (!title.startsWith("Geomacro finds ")) rowsValid = false;
  if (REQUIRED.has(category)) seen.add(category);
}
const threeDomain = [...REQUIRED].every((category) => seen.has(category));
const contractValid =
  response.ok &&
  body?.ok === true &&
  body?.mode === "verified_b2" &&
  Number(body?.live_observed_rows) === 0 &&
  rowsValid &&
  threeDomain;

const report = {
  ok: contractValid,
  endpoint: ENDPOINT,
  http_status: response.status,
  mode: body?.mode ?? null,
  newest_at: body?.newest_at ?? null,
  current_within_24h: body?.current_within_24h === true,
  verified_rows: Number(body?.verified_rows ?? rows.length),
  live_observed_rows: Number(body?.live_observed_rows ?? -1),
  categories: [...seen].sort(),
  invariants: {
    scored_only: rowsValid,
    verified_b2_only: body?.mode === "verified_b2" && Number(body?.live_observed_rows) === 0,
    three_domain: threeDomain,
    synthetic_freshness: false,
    destructive_change: false,
  },
  generated_at: new Date().toISOString(),
  serving_note: body?.current_within_24h === true
    ? "Latest verified scored package is current."
    : "No newer verified result is available; the latest verified scored package remains authoritative.",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/public-intelligence-live-fallback.json",
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report));

if (!contractValid) {
  throw new Error("PUBLIC_INTELLIGENCE_SCORED_CONTINUITY_INVALID");
}

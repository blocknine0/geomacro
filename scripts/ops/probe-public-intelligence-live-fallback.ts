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
const derivedRows = Array.isArray(body?.derived_signals) ? body.derived_signals : [];
const derivedCategories = new Map<string, number>([["geopolitics", 0], ["macro", 0], ["rare_earth", 0]]);
const derivedLatest = new Map<string, number>();
for (const row of derivedRows) {
  if (derivedCategories.has(row?.category) && typeof row?.title === "string" &&
      row.title.startsWith("Geomacro finds ") && row?.same_event_corrob_verified === false &&
      row?.severity === null && !/(?:https?:\/\/|www\.)/i.test(JSON.stringify(row))) {
    derivedCategories.set(row.category, (derivedCategories.get(row.category) ?? 0) + 1);
    const published = Date.parse(String(row?.published_at ?? ""));
    if (Number.isFinite(published)) derivedLatest.set(row.category,
      Math.max(derivedLatest.get(row.category) ?? -Infinity, published));
  }
}
const derivedNewest = Math.max(-Infinity, ...derivedLatest.values());
const derivedCurrentWithin24h = [...derivedCategories.keys()].every(category=>{
  const published=derivedLatest.get(category);
  return Number.isFinite(published)&&published!<=Date.now()&&Date.now()-published!<=DAY_MS;
});
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
  derived_rows: derivedRows.length,
  derived_category_counts: Object.fromEntries(derivedCategories),
  derived_latest_by_category: Object.fromEntries([...derivedCategories.keys()].map(category=>[
    category,derivedLatest.has(category)?new Date(derivedLatest.get(category)!).toISOString():null,
  ])),
  derived_categories_covered: [...derivedCategories].filter(([, count]) => count > 0).map(([category]) => category),
  derived_current_within_24h: derivedCurrentWithin24h,
  derived_read_status: body?.derived_read_status ?? "missing",
  categories: [...scoredCategories].sort(),
  invariants: {
    verified_scored_three_domain: verifiedRowsValid && threeDomain,
    live_observed_unscored: liveRowsValid,
    derived_only_unscored: derivedRows.every((row: any) => row?.severity === null &&
      row?.same_event_corrob_verified === false &&
      !/(?:https?:\/\/|www\.)/i.test(JSON.stringify(row))),
    derived_three_category_coverage: ["geopolitics", "macro", "rare_earth"]
      .every(category => (derivedCategories.get(category) ?? 0) > 0),
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

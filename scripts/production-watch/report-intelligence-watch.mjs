#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const DAYS = Math.max(1, Math.min(7, Number(process.env.WATCH_REPORT_DAYS || 7)));
const OUTPUT = String(process.env.WATCH_REPORT_OUTPUT || "production-watch-report.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchRows() {
  assert(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, "Supabase credentials are required");
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const url =
    `${SUPABASE_URL}/rest/v1/production_intelligence_watch_results?select=watch_date,probe_index,category,mode,as_of,build_verified,http_status,outcome,response_sha256,evidence_count,current_evidence_count,historical_evidence_count,latency_ms&executed_at=gte.${encodeURIComponent(since)}&order=watch_date.asc,probe_index.asc`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const body = await response.text();
  assert(response.ok, `Watch report query failed: HTTP ${response.status} ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

function summarize(rows) {
  const byDate = new Map();
  const byCategory = Object.fromEntries(["geopolitics", "macro", "critical_minerals"].map((key) => [key, 0]));
  const byMode = { current: 0, historical: 0 };
  const byOutcome = {};

  for (const row of rows) {
    const date = String(row.watch_date);
    const day = byDate.get(date) || { total: 0, current: 0, historical: 0, build_verified: 0, success: 0, insufficient_evidence: 0, errors: 0 };
    day.total += 1;
    day[row.mode] += 1;
    if (row.build_verified) day.build_verified += 1;
    if (row.outcome === "success") day.success += 1;
    if (row.outcome === "insufficient_evidence") day.insufficient_evidence += 1;
    if (!["success", "insufficient_evidence"].includes(row.outcome)) day.errors += 1;
    byDate.set(date, day);

    if (row.category in byCategory) byCategory[row.category] += 1;
    if (row.mode in byMode) byMode[row.mode] += 1;
    byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
  }

  const verified = rows.filter((row) => row.build_verified);
  const evidenceRows = rows.filter((row) => Number(row.evidence_count) > 0);
  const withCurrentEvidence = rows.filter((row) => Number(row.current_evidence_count) > 0);
  const withHistoricalEvidence = rows.filter((row) => Number(row.historical_evidence_count) > 0);
  const responseHasHash = rows.filter((row) => /^[a-f0-9]{64}$/.test(String(row.response_sha256 || "")));

  const latencies = rows
    .map((row) => Number(row.latency_ms))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const percentile = (p) =>
    latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] : null;

  const dayCounts = [...byDate.entries()].map(([watch_date, value]) => ({ watch_date, ...value }));

  return {
    generated_at: new Date().toISOString(),
    window_days: DAYS,
    total_probes: rows.length,
    expected_probes_for_full_window: DAYS * 1000,
    coverage_ratio: DAYS > 0 ? Number((rows.length / (DAYS * 1000)).toFixed(4)) : 0,
    category_counts: byCategory,
    mode_counts: byMode,
    outcome_counts: byOutcome,
    build_verified_probes: verified.length,
    build_verification_ratio: rows.length ? Number((verified.length / rows.length).toFixed(4)) : 0,
    responses_with_sha256: responseHasHash.length,
    responses_with_evidence: evidenceRows.length,
    probes_with_current_evidence: withCurrentEvidence.length,
    probes_with_historical_evidence: withHistoricalEvidence.length,
    latency_ms: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: latencies.length ? latencies[latencies.length - 1] : null,
    },
    daily: dayCounts,
  };
}

const rows = await fetchRows();
const report = summarize(rows);
writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

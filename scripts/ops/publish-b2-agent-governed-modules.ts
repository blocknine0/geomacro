#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import { commercialSourceEligibilityFromRow, type SourceRightsRow } from "../../src/lib/commercial-source-eligibility.server";
import { buildRiskGateV2PoliticalGovernanceModuleState } from "../../src/lib/risk-gate-v2-political-governance-module-state";
import { buildMacroNormalizationSnapshot, type MacroNormalizationInput } from "../../src/lib/country-risk-v02-normalization";
import { getFeatureMethodologyRule } from "../../src/lib/country-risk-v02-feature-methodology";
import { buildCountryMacroRiskComponent } from "../../src/lib/country-risk-v02-macro";
import { buildRiskGateV2SupportedMacroStates } from "../../src/lib/risk-gate-v2-macro-module-state";
import { buildRiskGateV2FinancialModuleState } from "../../src/lib/risk-gate-v2-financial-module-state";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const SNAPSHOT_KEY = "geomacro-evidence/v1/live/agent-governed-modules/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/agent-governed-modules/latest-proof.json";
const MAX_RAW_BYTES = 20_000_000;
const MAX_COMPRESSED_BYTES = 6_000_000;
const PAGE_SIZE = 1000;
const MAX_WGI_ROWS = 10_000;
const MAX_WDI_LATEST_ROWS = 5_000;
const MAX_WDI_RAW_ROWS = 10_000;
const MAX_ENTRIES = 1200;

const WGI_SOURCE = "world_bank_wgi_political_stability";
const WGI_METRIC = "political_stability_absolute_score";
const WDI_SOURCE = "world_bank_indicators";

const WORLD_BANK_MODULE_METRICS = {
  macro_monetary: [
    "inflation_consumer_prices_annual_pct",
    "real_gdp_growth_annual_pct",
    "unemployment_total_pct",
  ],
  sovereign_fiscal: ["central_government_debt_pct_gdp"],
  external_fx: ["total_reserves_months_imports", "current_account_balance_pct_gdp"],
} as const;

const FINANCIAL_METRICS = [
  "total_reserves_months_imports",
  "current_account_balance_pct_gdp",
  "bank_nonperforming_loans_pct",
  "bank_capital_to_assets_pct",
  "bank_liquid_reserves_to_assets_pct",
] as const;
const MACRO_METRICS = [
  ...WORLD_BANK_MODULE_METRICS.macro_monetary,
  ...WORLD_BANK_MODULE_METRICS.sovereign_fiscal,
] as const;
const ALL_WDI_METRICS = [...new Set([...MACRO_METRICS, ...FINANCIAL_METRICS])];

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

if (
  process.env.APP_SUPABASE_URL !== PROJECT_URL ||
  !process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) throw new Error("B2_AGENT_MODULE_PUBLISH_CONFIG_REQUIRED");

const db = createClient(
  PROJECT_URL,
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
);
const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

type AnyRow = Record<string, any>;
type ModuleName = "political_governance" | "macro_monetary" | "sovereign_fiscal" | "external_fx";
type SnapshotEntry = {
  country_iso3: string;
  module: ModuleName;
  source_id: string;
  source_observed_at: string;
  source_normalized_hashes: string[];
  state: Record<string, unknown>;
};

function iso3(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

function optionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseProvenance(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function observedMs(row: AnyRow) {
  const parsed = Date.parse(String(row.observed_at ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function macroFreshness(observedAt: string | null, asOf: string): MacroNormalizationInput["freshness_status"] {
  if (!observedAt) return "UNKNOWN";
  const observed = Date.parse(observedAt);
  const evaluation = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(evaluation)) return "UNKNOWN";
  const ageDays = Math.max(0, (evaluation - observed) / 86_400_000);
  if (ageDays <= 400) return "CURRENT";
  if (ageDays <= 800) return "AGING";
  return "STALE";
}

function financialFreshness(observedAt: string | null, asOf: string): MacroNormalizationInput["freshness_status"] {
  if (!observedAt) return "UNKNOWN";
  const observed = Date.parse(observedAt);
  const evaluation = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(evaluation)) return "UNKNOWN";
  const ageDays = Math.max(0, (evaluation - observed) / 86_400_000);
  if (ageDays <= 550) return "CURRENT";
  if (ageDays <= 900) return "AGING";
  return "STALE";
}

function publicRiskState(state: AnyRow) {
  return {
    module: String(state.module),
    score: Number(state.score),
    previous_score: state.previous_score === null ? null : Number(state.previous_score),
    delta: state.delta === null ? null : Number(state.delta),
    confidence: Number(state.confidence),
    coverage: String(state.coverage),
    commercial_eligibility_status: String(state.commercial_eligibility_status),
    generated_at: String(state.generated_at),
    expires_at: String(state.expires_at),
    methodology_version: String(state.methodology_version),
    drivers: Array.isArray(state.drivers)
      ? state.drivers.map((driver: AnyRow) => ({
          driver: String(driver.driver),
          score_contribution: Number(driver.score_contribution),
          delta_contribution: driver.delta_contribution === null ? null : Number(driver.delta_contribution),
          confidence: Number(driver.confidence),
        }))
      : [],
  };
}

async function readPaged(
  label: string,
  maxRows: number,
  page: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
) {
  const rows: AnyRow[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const result = await page(from, Math.min(from + PAGE_SIZE - 1, maxRows - 1));
    if (result.error || !Array.isArray(result.data)) {
      throw new Error(`B2_AGENT_MODULE_${label}_READ_FAILED_${result.error?.code ?? "unknown"}`);
    }
    rows.push(...result.data);
    if (result.data.length < PAGE_SIZE) return rows;
  }
  throw new Error(`B2_AGENT_MODULE_${label}_TRUNCATION_GUARD`);
}

async function readSourceRights() {
  const { data, error } = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
    .in("source_id", [WGI_SOURCE, WDI_SOURCE]);
  if (error || !Array.isArray(data)) throw new Error("B2_AGENT_MODULE_SOURCE_RIGHTS_READ_FAILED");
  const rights = new Map<string, SourceRightsRow>();
  for (const row of data) {
    if (typeof row.source_id !== "string") continue;
    rights.set(row.source_id, {
      source_id: row.source_id,
      commercial_usage_status: row.commercial_usage_status ?? null,
      enabled_for_ingestion: row.enabled_for_ingestion === true,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
      raw_redistribution_allowed: row.raw_redistribution_allowed === true,
      attribution_required: row.attribution_required === true,
      licence_name: row.licence_name ?? null,
    });
  }
  if (![WGI_SOURCE, WDI_SOURCE].every((source) => rights.has(source))) {
    throw new Error("B2_AGENT_MODULE_SOURCE_RIGHTS_INCOMPLETE");
  }
  return rights;
}

async function readWgiRows(asOf: string) {
  return readPaged("WGI", MAX_WGI_ROWS, async (from, to) => await db
    .from("live_external_observations")
    .select("country_iso3,value_numeric,observed_at,normalized_hash,provenance,quality_status,commercial_eligibility_status")
    .eq("source_id", WGI_SOURCE)
    .eq("metric", WGI_METRIC)
    .eq("quality_status", "VERIFIED")
    .lte("observed_at", asOf)
    .order("country_iso3", { ascending: true })
    .order("observed_at", { ascending: false, nullsFirst: false })
    .range(from, to));
}

async function readWdiLatest(asOf: string) {
  return readPaged("WDI_LATEST", MAX_WDI_LATEST_ROWS, async (from, to) => await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at,normalized_hash,quality_status,commercial_eligibility_status")
    .in("metric", ALL_WDI_METRICS)
    .lte("observed_at", asOf)
    .order("country_iso3", { ascending: true })
    .order("metric", { ascending: true })
    .range(from, to));
}

async function readWdiRaw(asOf: string) {
  return readPaged("WDI_RAW", MAX_WDI_RAW_ROWS, async (from, to) => await db
    .from("live_external_observations")
    .select("country_iso3,metric,observed_at,normalized_hash,quality_status,commercial_eligibility_status")
    .eq("source_id", WDI_SOURCE)
    .eq("quality_status", "VERIFIED")
    .in("metric", ALL_WDI_METRICS)
    .lte("observed_at", asOf)
    .order("country_iso3", { ascending: true })
    .order("observed_at", { ascending: false, nullsFirst: false })
    .range(from, to));
}

function exactModuleEvidence(rows: AnyRow[], country: string, module: keyof typeof WORLD_BANK_MODULE_METRICS) {
  const allowed = new Set<string>(WORLD_BANK_MODULE_METRICS[module]);
  const selected = rows
    .filter((row) => String(row.country_iso3 ?? "").toUpperCase() === country && allowed.has(String(row.metric ?? "")))
    .sort((a, b) => observedMs(b) - observedMs(a))
    .slice(0, 100);
  if (selected.length === 0 || selected.some((row) => row.commercial_eligibility_status !== "VERIFIED")) return null;
  const times = selected.map(observedMs).filter(Number.isFinite);
  const latest = times.length ? Math.max(...times) : Number.NaN;
  const hashes = [...new Set(selected
    .map((row) => typeof row.normalized_hash === "string" ? row.normalized_hash : "")
    .filter((value) => /^[a-f0-9]{64}$/i.test(value)))].sort();
  if (!Number.isFinite(latest) || hashes.length === 0) return null;
  return { source_observed_at: new Date(latest).toISOString(), hashes };
}

function buildWgiEntries(rows: AnyRow[], generatedAt: string): SnapshotEntry[] {
  const latest = new Map<string, AnyRow>();
  for (const row of rows) {
    const country = String(row.country_iso3 ?? "").trim().toUpperCase();
    if (!iso3(country) || !Number.isFinite(Number(row.value_numeric))) continue;
    const current = latest.get(country);
    if (!current || observedMs(row) > observedMs(current)) latest.set(country, row);
  }
  const entries: SnapshotEntry[] = [];
  for (const [country, row] of latest) {
    if (row.commercial_eligibility_status !== "VERIFIED") continue;
    const observedAt = typeof row.observed_at === "string" ? row.observed_at : null;
    const normalizedHash = typeof row.normalized_hash === "string" ? row.normalized_hash : null;
    if (!observedAt || !normalizedHash || !/^[a-f0-9]{64}$/i.test(normalizedHash)) continue;
    const provenance = parseProvenance(row.provenance);
    const state = buildRiskGateV2PoliticalGovernanceModuleState({
      current: {
        country_iso3: country,
        stability_score: Number(row.value_numeric),
        observed_at: observedAt,
        normalized_hash: normalizedHash,
        score_ci_lower: optionalNumber(provenance.score_ci_lower),
        score_ci_upper: optionalNumber(provenance.score_ci_upper),
        source_count: optionalNumber(provenance.source_count),
        commercial_eligibility_status: "VERIFIED",
      },
      generated_at: generatedAt,
    });
    if (state.commercial_eligibility_status !== "VERIFIED") continue;
    entries.push({
      country_iso3: country,
      module: "political_governance",
      source_id: WGI_SOURCE,
      source_observed_at: observedAt,
      source_normalized_hashes: [normalizedHash],
      state: publicRiskState(state),
    });
  }
  return entries;
}

function buildWdiEntries(latestRows: AnyRow[], rawRows: AnyRow[], generatedAt: string): SnapshotEntry[] {
  const snapshots: Record<string, any> = {};
  for (const metric of MACRO_METRICS) {
    const rule = getFeatureMethodologyRule("MACRO", metric);
    if (rule.mode !== "SCORE_READY") throw new Error(`B2_AGENT_MODULE_WDI_METRIC_NOT_SCORE_READY_${metric}`);
    const observations: MacroNormalizationInput[] = latestRows
      .filter((row) => row.metric === metric && iso3(String(row.country_iso3 ?? "").toUpperCase()) && Number.isFinite(Number(row.value_numeric)))
      .map((row) => ({
        country_iso3: String(row.country_iso3).toUpperCase(),
        metric,
        value_numeric: Number(row.value_numeric),
        unit: typeof row.unit === "string" ? row.unit : null,
        observed_at: typeof row.observed_at === "string" ? row.observed_at : null,
        freshness_status: macroFreshness(typeof row.observed_at === "string" ? row.observed_at : null, generatedAt),
      }));
    try {
      snapshots[metric] = buildMacroNormalizationSnapshot({ metric, direction: rule.direction, as_of: generatedAt, observations });
    } catch (error) {
      if (metric === "central_government_debt_pct_gdp" && error instanceof Error && error.message.startsWith(`Insufficient peer coverage for ${metric}: `)) continue;
      throw error;
    }
  }

  const componentSnapshots = {
    inflation: snapshots.inflation_consumer_prices_annual_pct,
    growth: snapshots.real_gdp_growth_annual_pct,
    unemployment: snapshots.unemployment_total_pct,
    government_debt: snapshots.central_government_debt_pct_gdp,
  };
  const financialObservations: MacroNormalizationInput[] = latestRows
    .filter((row) => FINANCIAL_METRICS.includes(row.metric as (typeof FINANCIAL_METRICS)[number]) && iso3(String(row.country_iso3 ?? "").toUpperCase()) && Number.isFinite(Number(row.value_numeric)))
    .map((row) => ({
      country_iso3: String(row.country_iso3).toUpperCase(),
      metric: String(row.metric),
      value_numeric: Number(row.value_numeric),
      unit: typeof row.unit === "string" ? row.unit : null,
      observed_at: typeof row.observed_at === "string" ? row.observed_at : null,
      freshness_status: financialFreshness(typeof row.observed_at === "string" ? row.observed_at : null, generatedAt),
    }));
  const countries = [...new Set(latestRows
    .map((row) => String(row.country_iso3 ?? "").trim().toUpperCase())
    .filter(iso3))].sort();
  const entries: SnapshotEntry[] = [];

  for (const country of countries) {
    const component = buildCountryMacroRiskComponent({ country_iso3: country, as_of: generatedAt, snapshots: componentSnapshots });
    const macroStates = buildRiskGateV2SupportedMacroStates({
      component,
      generated_at: generatedAt,
      commercial_eligibility_status: "VERIFIED",
    });
    for (const module of ["macro_monetary", "sovereign_fiscal"] as const) {
      const state = macroStates.find((candidate) => candidate.module === module);
      const evidence = exactModuleEvidence(rawRows, country, module);
      if (!state || state.commercial_eligibility_status !== "VERIFIED" || !evidence) continue;
      entries.push({
        country_iso3: country,
        module,
        source_id: WDI_SOURCE,
        source_observed_at: evidence.source_observed_at,
        source_normalized_hashes: evidence.hashes,
        state: publicRiskState(state),
      });
    }
    const fxState = buildRiskGateV2FinancialModuleState({
      country_iso3: country,
      module: "currency_capital_mobility",
      as_of: generatedAt,
      observations: financialObservations,
      generated_at: generatedAt,
      commercial_eligibility_status: "VERIFIED",
    });
    const fxEvidence = exactModuleEvidence(rawRows, country, "external_fx");
    if (fxState && fxState.commercial_eligibility_status === "VERIFIED" && fxEvidence) {
      entries.push({
        country_iso3: country,
        module: "external_fx",
        source_id: WDI_SOURCE,
        source_observed_at: fxEvidence.source_observed_at,
        source_normalized_hashes: fxEvidence.hashes,
        state: publicRiskState(fxState),
      });
    }
  }
  return entries;
}

const generatedAt = new Date().toISOString();
const rights = await readSourceRights();
const wgiEligibility = commercialSourceEligibilityFromRow(WGI_SOURCE, rights.get(WGI_SOURCE) ?? null);
const wdiEligibility = commercialSourceEligibilityFromRow(WDI_SOURCE, rights.get(WDI_SOURCE) ?? null);
if (!wgiEligibility.eligible || !wdiEligibility.eligible) {
  throw new Error("B2_AGENT_MODULE_CURRENT_COMMERCIAL_SOURCES_NOT_ELIGIBLE");
}

const [wgiRows, wdiLatest, wdiRaw] = await Promise.all([
  readWgiRows(generatedAt),
  readWdiLatest(generatedAt),
  readWdiRaw(generatedAt),
]);
const entries = [
  ...buildWgiEntries(wgiRows, generatedAt),
  ...buildWdiEntries(wdiLatest, wdiRaw, generatedAt),
].sort((a, b) => a.country_iso3.localeCompare(b.country_iso3) || a.module.localeCompare(b.module));
if (entries.length === 0 || entries.length > MAX_ENTRIES) throw new Error("B2_AGENT_MODULE_ENTRY_COUNT_INVALID");
const seen = new Set<string>();
for (const entry of entries) {
  const key = `${entry.country_iso3}:${entry.module}`;
  if (seen.has(key)) throw new Error("B2_AGENT_MODULE_DUPLICATE_ENTRY");
  seen.add(key);
}

const payload = {
  schema: "geomacro.agent-governed-modules-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  delivery_boundary: "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL",
  included_source_ids: [WGI_SOURCE, WDI_SOURCE],
  excluded_source_gates: [{ source_id: "usgs_mcs", reason: "CURRENT_COMMERCIAL_SIGNALS_GATE_NOT_ENABLED" }],
  entries,
};
const raw = Buffer.from(JSON.stringify(payload));
if (!raw.length || raw.length > MAX_RAW_BYTES) throw new Error("B2_AGENT_MODULE_RAW_SIZE_INVALID");
const packed = gzipSync(raw, { level: 9 });
if (!packed.length || packed.length > MAX_COMPRESSED_BYTES) throw new Error("B2_AGENT_MODULE_COMPRESSED_SIZE_INVALID");
const digest = sha256(packed);
await b2.put(SNAPSHOT_KEY, packed);
const readback = await b2.get(SNAPSHOT_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) throw new Error("B2_AGENT_MODULE_READBACK_HASH_INVALID");
const restoredRaw = gunzipSync(readback);
if (!restoredRaw.equals(raw)) throw new Error("B2_AGENT_MODULE_RESTORE_BYTES_INVALID");
const restored = JSON.parse(restoredRaw.toString("utf8"));
if (
  restored?.schema !== payload.schema ||
  restored?.generated_at !== generatedAt ||
  restored?.source_project !== PROJECT_REF ||
  restored?.delivery_boundary !== payload.delivery_boundary ||
  !Array.isArray(restored?.entries) ||
  restored.entries.length !== entries.length
) throw new Error("B2_AGENT_MODULE_RESTORE_INVALID");

const byModule = entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.module] = (acc[entry.module] ?? 0) + 1;
  return acc;
}, {});
const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.agent-governed-modules-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  snapshot_key: SNAPSHOT_KEY,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  raw_bytes: raw.length,
  source_rows: { wgi: wgiRows.length, wdi_latest: wdiLatest.length, wdi_raw: wdiRaw.length },
  entries: entries.length,
  entries_by_module: byModule,
  included_source_ids: payload.included_source_ids,
  excluded_source_gates: payload.excluded_source_gates,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
  raw_source_material_in_snapshot: false,
  verification: "authoritative-source-rights+governed-latest-inputs+pure-derived-state-builders+full-b2-readback-sha256+exact-gzip-restore",
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_AGENT_MODULE_PROOF_READBACK_INVALID");

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  source_rows: { wgi: wgiRows.length, wdi_latest: wdiLatest.length, wdi_raw: wdiRaw.length },
  entries: entries.length,
  entries_by_module: byModule,
  excluded_source_gates: payload.excluded_source_gates,
  compressed_bytes: packed.length,
  b2_objects_verified: 2,
}));

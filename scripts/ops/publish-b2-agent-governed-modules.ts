#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  commercialSourceEligibilityFromRow,
  type SourceRightsRow,
} from "../../src/lib/commercial-source-eligibility.server";
import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "../../src/lib/country-risk-v02-normalization";
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
const MAX_WDI_LATEST_ROWS = 5_000;
const MAX_WDI_RAW_ROWS = 10_000;
const MAX_USGS_ROWS = 5_000;
const MAX_ENTRIES = 1_500;

const WDI_SOURCE = "world_bank_indicators";
const USGS_SOURCE = "usgs_mcs";
const WGI_SOURCE = "world_bank_wgi_political_stability";
const REQUIRED_SOURCES = [WDI_SOURCE, USGS_SOURCE] as const;
const SOURCE_CENSUS = [WDI_SOURCE, USGS_SOURCE, WGI_SOURCE] as const;
const CRITICAL_MINERALS_METHOD_VERSION = "agent-critical-minerals-usgs-evidence-v1";

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
type ModuleName = "macro_monetary" | "sovereign_fiscal" | "external_fx" | "critical_minerals";
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
  const [sourcesResult, certificationsResult] = await Promise.all([
    db
      .from("live_external_sources")
      .select("source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
      .in("source_id", [...SOURCE_CENSUS]),
    db
      .from("live_source_certification_records")
      .select("source_id,certification_state")
      .in("source_id", [...SOURCE_CENSUS]),
  ]);
  if (sourcesResult.error || !Array.isArray(sourcesResult.data)) {
    throw new Error("B2_AGENT_MODULE_SOURCE_RIGHTS_READ_FAILED");
  }
  if (certificationsResult.error || !Array.isArray(certificationsResult.data)) {
    throw new Error("B2_AGENT_MODULE_SOURCE_CERTIFICATION_READ_FAILED");
  }

  const certification = new Map<string, string>();
  for (const row of certificationsResult.data) {
    if (typeof row.source_id === "string" && typeof row.certification_state === "string") {
      certification.set(row.source_id, row.certification_state);
    }
  }

  const rights = new Map<string, SourceRightsRow>();
  for (const row of sourcesResult.data) {
    if (typeof row.source_id !== "string") continue;
    rights.set(row.source_id, {
      source_id: row.source_id,
      category: typeof row.category === "string" ? row.category : null,
      certification_state: certification.get(row.source_id) ?? null,
      commercial_usage_status: row.commercial_usage_status ?? null,
      enabled_for_ingestion: row.enabled_for_ingestion === true,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
      raw_redistribution_allowed: row.raw_redistribution_allowed === true,
      attribution_required: row.attribution_required === true,
      licence_name: row.licence_name ?? null,
    });
  }

  if (!REQUIRED_SOURCES.every((source) => rights.has(source))) {
    throw new Error("B2_AGENT_MODULE_REQUIRED_SOURCE_RIGHTS_INCOMPLETE");
  }
  return rights;
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

async function readUsgsRows(asOf: string) {
  return readPaged("USGS", MAX_USGS_ROWS, async (from, to) => await db
    .from("live_external_observations")
    .select("country_iso3,commodity,metric,observed_at,normalized_hash,quality_status,commercial_eligibility_status")
    .eq("source_id", USGS_SOURCE)
    .eq("category", "CRITICAL_MINERALS")
    .eq("quality_status", "VERIFIED")
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

function buildUsgsEntries(rows: AnyRow[]): SnapshotEntry[] {
  const byCountry = new Map<string, AnyRow[]>();
  for (const row of rows) {
    const country = String(row.country_iso3 ?? "").trim().toUpperCase();
    if (!iso3(country)) continue;
    const bucket = byCountry.get(country) ?? [];
    bucket.push(row);
    byCountry.set(country, bucket);
  }

  const entries: SnapshotEntry[] = [];
  for (const [country, countryRows] of byCountry) {
    const latestMs = Math.max(...countryRows.map(observedMs));
    if (!Number.isFinite(latestMs)) continue;
    const currentRows = countryRows.filter((row) => observedMs(row) === latestMs);
    if (
      currentRows.length === 0 ||
      currentRows.some(
        (row) =>
          row.quality_status !== "VERIFIED" ||
          !["VERIFIED", "DERIVED_ONLY"].includes(String(row.commercial_eligibility_status ?? "")),
      )
    ) continue;

    const hashes = [...new Set(currentRows
      .map((row) => typeof row.normalized_hash === "string" ? row.normalized_hash : "")
      .filter((value) => /^[a-f0-9]{64}$/i.test(value)))].sort();
    if (hashes.length === 0) continue;

    const commodities = [...new Set(currentRows
      .map((row) => typeof row.commodity === "string" ? row.commodity.trim() : "")
      .filter(Boolean))].sort();
    const metrics = [...new Set(currentRows
      .map((row) => typeof row.metric === "string" ? row.metric.trim() : "")
      .filter(Boolean))].sort();

    entries.push({
      country_iso3: country,
      module: "critical_minerals",
      source_id: USGS_SOURCE,
      source_observed_at: new Date(latestMs).toISOString(),
      source_normalized_hashes: hashes,
      state: {
        methodology_version: CRITICAL_MINERALS_METHOD_VERSION,
        coverage: "EVIDENCE_ONLY",
        latest_observation_year: new Date(latestMs).getUTCFullYear(),
        observation_count: currentRows.length,
        commodity_count: commodities.length,
        commodities,
        metric_count: metrics.length,
        metrics,
        evidence_hash: sha256(hashes.join("\n")),
      },
    });
  }
  return entries;
}

const generatedAt = new Date().toISOString();
const rights = await readSourceRights();
const eligibility = new Map(
  SOURCE_CENSUS.map((sourceId) => [
    sourceId,
    commercialSourceEligibilityFromRow(sourceId, rights.get(sourceId) ?? null),
  ]),
);
for (const sourceId of REQUIRED_SOURCES) {
  const result = eligibility.get(sourceId);
  if (!result?.eligible) {
    throw new Error(`B2_AGENT_MODULE_REQUIRED_SOURCE_NOT_ELIGIBLE_${sourceId}_${result?.reason ?? "UNKNOWN"}`);
  }
}

const [wdiLatest, wdiRaw, usgsRows] = await Promise.all([
  readWdiLatest(generatedAt),
  readWdiRaw(generatedAt),
  readUsgsRows(generatedAt),
]);
const entries = [
  ...buildWdiEntries(wdiLatest, wdiRaw, generatedAt),
  ...buildUsgsEntries(usgsRows),
].sort((a, b) => a.country_iso3.localeCompare(b.country_iso3) || a.module.localeCompare(b.module));

if (entries.length === 0 || entries.length > MAX_ENTRIES) {
  throw new Error("B2_AGENT_MODULE_ENTRY_COUNT_INVALID");
}
if (!entries.some((entry) => entry.source_id === WDI_SOURCE)) {
  throw new Error("B2_AGENT_MODULE_WDI_ENTRIES_MISSING");
}
if (!entries.some((entry) => entry.source_id === USGS_SOURCE && entry.module === "critical_minerals")) {
  throw new Error("B2_AGENT_MODULE_USGS_ENTRIES_MISSING");
}

const seen = new Set<string>();
for (const entry of entries) {
  const key = `${entry.country_iso3}:${entry.module}`;
  if (seen.has(key)) throw new Error("B2_AGENT_MODULE_DUPLICATE_ENTRY");
  seen.add(key);
}

const includedSourceIds = [...new Set(entries.map((entry) => entry.source_id))].sort();
const excludedSourceGates = SOURCE_CENSUS
  .filter((sourceId) => !includedSourceIds.includes(sourceId))
  .map((sourceId) => ({
    source_id: sourceId,
    reason: eligibility.get(sourceId)?.reason ?? "NO_CURRENT_GOVERNED_MODULE_OUTPUT",
  }));

const payload = {
  schema: "geomacro.agent-governed-modules-live.v2",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  delivery_boundary: "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL",
  included_source_ids: includedSourceIds,
  excluded_source_gates: excludedSourceGates,
  entries,
};
const raw = Buffer.from(JSON.stringify(payload));
if (!raw.length || raw.length > MAX_RAW_BYTES) throw new Error("B2_AGENT_MODULE_RAW_SIZE_INVALID");
const packed = gzipSync(raw, { level: 9 });
if (!packed.length || packed.length > MAX_COMPRESSED_BYTES) throw new Error("B2_AGENT_MODULE_COMPRESSED_SIZE_INVALID");
const digest = sha256(packed);
await b2.put(SNAPSHOT_KEY, packed);
const readback = await b2.get(SNAPSHOT_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) {
  throw new Error("B2_AGENT_MODULE_READBACK_HASH_INVALID");
}
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
  schema: "geomacro.agent-governed-modules-proof.v2",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  snapshot_key: SNAPSHOT_KEY,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  raw_bytes: raw.length,
  source_rows: {
    wdi_latest: wdiLatest.length,
    wdi_raw: wdiRaw.length,
    usgs: usgsRows.length,
  },
  entries: entries.length,
  entries_by_module: byModule,
  included_source_ids: payload.included_source_ids,
  excluded_source_gates: payload.excluded_source_gates,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
  raw_source_material_in_snapshot: false,
  verification: "certified-commercial-signal-sources+governed-latest-inputs+pure-derived-state-builders+full-b2-readback-sha256+exact-gzip-restore",
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_AGENT_MODULE_PROOF_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  generated_at: generatedAt,
  source_rows: {
    wdi_latest: wdiLatest.length,
    wdi_raw: wdiRaw.length,
    usgs: usgsRows.length,
  },
  entries: entries.length,
  entries_by_module: byModule,
  included_source_ids: includedSourceIds,
  excluded_source_gates: excludedSourceGates,
  compressed_bytes: packed.length,
  b2_objects_verified: 2,
}));

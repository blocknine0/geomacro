import { b2PrivateArchiveReadConfigured, readPrivateB2Object } from "./b2-private-archive-read.server";
const SERVING_PREFIX = "geomacro-evidence/v1/structural/serving/agent-governed-modules";
const B2_KEY = `${SERVING_PREFIX}/latest.json.gz`;
const B2_PROOF_KEY = `${SERVING_PREFIX}/latest-proof.json`;
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const REQUEST_TIMEOUT_MS = 3_500;
const CACHE_TTL_MS = 120_000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const MAX_COMPRESSED_BYTES = 6_000_000;
const MAX_DECOMPRESSED_BYTES = 20_000_000;
export const AGENT_GOVERNED_MODULES_B2_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type B2AgentGovernedModuleName =
  | "political_governance"
  | "macro_monetary"
  | "sovereign_fiscal"
  | "external_fx"
  | "critical_minerals";

export type B2AgentGovernedRiskState = {
  module: string;
  score: number;
  previous_score: number | null;
  delta: number | null;
  confidence: number;
  coverage: string;
  commercial_eligibility_status: string;
  generated_at: string;
  expires_at: string;
  methodology_version: string;
  drivers: Array<{
    driver: string;
    score_contribution: number;
    delta_contribution: number | null;
    confidence: number;
  }>;
};

export type B2AgentCriticalMineralsState = {
  methodology_version: string;
  coverage: "EVIDENCE_ONLY";
  latest_observation_year: number;
  observation_count: number;
  commodity_count: number;
  commodities: string[];
  metric_count: number;
  metrics: string[];
  evidence_hash: string;
};

export type B2AgentGovernedModuleEntry = {
  country_iso3: string;
  module: B2AgentGovernedModuleName;
  source_id: string;
  source_observed_at: string;
  source_normalized_hashes: string[];
  state: B2AgentGovernedRiskState | B2AgentCriticalMineralsState;
};

type CacheEntry = { expiresAt: number; bytes: Uint8Array };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const cache = new Map<string, CacheEntry>();
let failureCount = 0;
let circuitOpenedAt = 0;

const EXPECTED_SOURCE: Record<B2AgentGovernedModuleName, string> = {
  political_governance: "world_bank_wgi_political_stability",
  macro_monetary: "world_bank_indicators",
  sovereign_fiscal: "world_bank_indicators",
  external_fx: "world_bank_indicators",
  critical_minerals: "usgs_mcs",
};

const EXPECTED_STATE_MODULE: Partial<Record<B2AgentGovernedModuleName, string>> = {
  political_governance: "political_governance",
  macro_monetary: "macro_monetary",
  sovereign_fiscal: "sovereign_fiscal",
  external_fx: "currency_capital_mobility",
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function circuitOpen(now = Date.now()) {
  if (!circuitOpenedAt) return false;
  if (now - circuitOpenedAt >= CIRCUIT_OPEN_MS) {
    circuitOpenedAt = 0;
    failureCount = 0;
    return false;
  }
  return true;
}

function noteSuccess() {
  failureCount = 0;
  circuitOpenedAt = 0;
}

function noteFailure() {
  failureCount += 1;
  if (failureCount >= FAILURE_THRESHOLD && !circuitOpenedAt) circuitOpenedAt = Date.now();
}

async function signedGet(key: string): Promise<Uint8Array | null> {
  if (!b2PrivateArchiveReadConfigured() || circuitOpen()) return null;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bytes;

  try {
    const buffer = await readPrivateB2Object(key, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_COMPRESSED_BYTES,
    });
    const bytes = new Uint8Array(buffer);
    noteSuccess();
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes });
    return bytes;
  } catch {
    noteFailure();
    return null;
  }
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (!raw.length || raw.length > MAX_DECOMPRESSED_BYTES) {
    throw new Error("B2_AGENT_MODULES_DECOMPRESSED_SIZE_INVALID");
  }
  return raw;
}

function recentEnough(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return (
    Number.isFinite(parsed) &&
    parsed <= Date.now() + 5 * 60_000 &&
    Date.now() - parsed <= AGENT_GOVERNED_MODULES_B2_MAX_AGE_MS
  );
}

function iso3(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function riskState(value: unknown, expectedModule: string): value is B2AgentGovernedRiskState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (
    state.module !== expectedModule ||
    !finite(state.score) || state.score < 0 || state.score > 100 ||
    !(state.previous_score === null || finite(state.previous_score)) ||
    !(state.delta === null || finite(state.delta)) ||
    !finite(state.confidence) || state.confidence < 0 || state.confidence > 1 ||
    typeof state.coverage !== "string" || !state.coverage ||
    state.commercial_eligibility_status !== "VERIFIED" ||
    !recentEnough(state.generated_at) ||
    typeof state.expires_at !== "string" ||
    !Number.isFinite(Date.parse(state.expires_at)) ||
    Date.parse(state.expires_at) <= Date.parse(String(state.generated_at)) ||
    typeof state.methodology_version !== "string" || !state.methodology_version ||
    !Array.isArray(state.drivers) || state.drivers.length > 32
  ) return false;
  return state.drivers.every((driver) => {
    if (!driver || typeof driver !== "object" || Array.isArray(driver)) return false;
    const row = driver as Record<string, unknown>;
    return (
      typeof row.driver === "string" && row.driver.length > 0 &&
      finite(row.score_contribution) &&
      (row.delta_contribution === null || finite(row.delta_contribution)) &&
      finite(row.confidence) && row.confidence >= 0 && row.confidence <= 1
    );
  });
}

function criticalState(value: unknown): value is B2AgentCriticalMineralsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (
    state.methodology_version === "agent-critical-minerals-usgs-evidence-v1" &&
    state.coverage === "EVIDENCE_ONLY" &&
    Number.isInteger(state.latest_observation_year) &&
    Number(state.latest_observation_year) >= 1900 && Number(state.latest_observation_year) <= 2200 &&
    Number.isInteger(state.observation_count) && Number(state.observation_count) > 0 && Number(state.observation_count) <= 5000 &&
    Number.isInteger(state.commodity_count) && Number(state.commodity_count) >= 0 && Number(state.commodity_count) <= 500 &&
    Array.isArray(state.commodities) && state.commodities.length === Number(state.commodity_count) && state.commodities.every((item) => typeof item === "string") &&
    Number.isInteger(state.metric_count) && Number(state.metric_count) >= 0 && Number(state.metric_count) <= 500 &&
    Array.isArray(state.metrics) && state.metrics.length === Number(state.metric_count) && state.metrics.every((item) => typeof item === "string") &&
    hash(state.evidence_hash)
  );
}

function validEntry(value: unknown): value is B2AgentGovernedModuleEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const module = entry.module as B2AgentGovernedModuleName;
  if (
    !iso3(entry.country_iso3) ||
    !Object.prototype.hasOwnProperty.call(EXPECTED_SOURCE, module) ||
    entry.source_id !== EXPECTED_SOURCE[module] ||
    typeof entry.source_observed_at !== "string" ||
    !Number.isFinite(Date.parse(entry.source_observed_at)) ||
    !Array.isArray(entry.source_normalized_hashes) ||
    entry.source_normalized_hashes.length === 0 ||
    entry.source_normalized_hashes.length > 100 ||
    !entry.source_normalized_hashes.every(hash)
  ) return false;
  if (module === "critical_minerals") return criticalState(entry.state);
  const expectedStateModule = EXPECTED_STATE_MODULE[module];
  return Boolean(expectedStateModule && riskState(entry.state, expectedStateModule));
}

export async function readB2AgentGovernedModulesSnapshot(): Promise<{
  generated_at: string;
  entries: B2AgentGovernedModuleEntry[];
} | null> {
  const [compressed, proofBytes] = await Promise.all([
    signedGet(B2_KEY),
    signedGet(B2_PROOF_KEY),
  ]);
  if (!compressed || !proofBytes) return null;
  try {
    const proof = JSON.parse(decoder.decode(proofBytes)) as Record<string, unknown>;
    if (
      proof.schema !== "geomacro.agent-governed-modules-proof.v2" ||
      proof.source_project !== SOURCE_PROJECT ||
      proof.snapshot_key !== B2_KEY ||
      !recentEnough(proof.generated_at) ||
      !/^[a-f0-9]{64}$/i.test(String(proof.compressed_sha256 ?? "")) ||
      Number(proof.compressed_bytes) !== compressed.length ||
      (await sha256(compressed)) !== String(proof.compressed_sha256)
    ) return null;
    const raw = await gunzip(compressed);
    const payload = JSON.parse(decoder.decode(raw)) as Record<string, unknown>;
    if (
      payload.schema !== "geomacro.agent-governed-modules-live.v2" ||
      payload.source_project !== SOURCE_PROJECT ||
      payload.generated_at !== proof.generated_at ||
      !recentEnough(payload.generated_at) ||
      payload.delivery_boundary !== "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL" ||
      !Array.isArray(payload.entries) ||
      payload.entries.length === 0 ||
      payload.entries.length > 1500 ||
      !payload.entries.every(validEntry)
    ) return null;
    const seen = new Set<string>();
    for (const value of payload.entries as B2AgentGovernedModuleEntry[]) {
      const key = `${value.country_iso3}:${value.module}`;
      if (seen.has(key)) return null;
      seen.add(key);
    }
    return {
      generated_at: String(payload.generated_at),
      entries: payload.entries as B2AgentGovernedModuleEntry[],
    };
  } catch {
    return null;
  }
}

export async function readB2AgentGovernedModule(
  countryIso3: string,
  module: B2AgentGovernedModuleName,
): Promise<B2AgentGovernedModuleEntry | null> {
  const iso = countryIso3.trim().toUpperCase();
  if (!iso3(iso)) return null;
  const snapshot = await readB2AgentGovernedModulesSnapshot();
  return snapshot?.entries.find((entry) => entry.country_iso3 === iso && entry.module === module) ?? null;
}

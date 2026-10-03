#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createB2Client } from "./ops/b2-s3-client.mjs";

const MAX_SOURCE_ROWS = 250;
const MAX_FRAGMENT_MEMBERS = 25;
const MAX_FRAGMENT_UNCOMPRESSED_BYTES = 8_000_000;
const MAX_FRAGMENT_COMPRESSED_BYTES = 1_500_000;
const MAX_FRAGMENTS_PER_SOURCE = 12;
const artifactDir = "artifacts/governed-source-ingestion";
const sourceStatePath = process.env.D1_SOURCE_STATE_FILE ?? `${artifactDir}/d1-source-state.json`;
const now = new Date().toISOString();
mkdirSync(artifactDir, { recursive: true });

const GOVERNED_SOURCE_CONTRACTS = Object.freeze({
  eia_api_v2: Object.freeze({
    source_id: "eia_api_v2",
    category: "CRITICAL_MINERALS",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: false,
    commercial_usage_status: "COMMERCIAL_OK",
  }),
  noaa_ncei_cdo_api: Object.freeze({
    source_id: "noaa_ncei_cdo_api",
    category: "MULTI_DOMAIN",
    enabled_for_ingestion: true,
    enabled_for_commercial_signals: false,
    commercial_usage_status: "COMMERCIAL_OK",
  }),
});

const env = (name) => {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canon = (value) => Array.isArray(value)
  ? value.map(canon)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canon(item)]))
    : value;
const hash = (value) => sha(Buffer.from(JSON.stringify(canon(value))));
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

const d1State = JSON.parse(readFileSync(sourceStatePath, "utf8"));
if (d1State?.schema !== "geomacro.d1-governed-source-state.v1" || !Array.isArray(d1State?.sources)) {
  throw new Error("D1_SOURCE_STATE_INVALID");
}
const d1BySource = new Map(d1State.sources.map((row) => [row.source_key, row]));

function governedSource(sourceId) {
  const contract = GOVERNED_SOURCE_CONTRACTS[sourceId];
  const state = d1BySource.get(sourceId);
  if (!contract || contract.source_id !== sourceId || contract.enabled_for_ingestion !== true) throw new Error(`SOURCE_CONTRACT_NOT_ENABLED:${sourceId}`);
  if (contract.enabled_for_commercial_signals && !["COMMERCIAL_OK", "DERIVED_ONLY"].includes(contract.commercial_usage_status)) {
    throw new Error(`SOURCE_CONTRACT_COMMERCIAL_UNSAFE:${sourceId}`);
  }
  if (!state || state.source_key !== sourceId || Number(state.enabled) !== 1) throw new Error(`D1_SOURCE_NOT_ENABLED:${sourceId}`);
  for (const key of ["certification_status", "rights_status", "endpoint_status", "schema_status", "freshness_status", "provenance_status", "independence_status", "runtime_status", "fallback_status"]) {
    const value = String(state[key] ?? "").trim().toUpperCase();
    if (!value || value === "UNTESTED" || value === "UNREVIEWED") throw new Error(`D1_SOURCE_STATE_NOT_EXPLICIT:${sourceId}:${key}`);
  }
  return { ...contract, d1_state: state };
}

const b2 = createB2Client({
  endpointUrl: env("B2_S3_ENDPOINT"),
  accessKey: env("B2_KEY_ID"),
  secretKey: env("B2_APPLICATION_KEY"),
  bucket: "geomacro-private-archive",
});

function sourceObservedAt(value, sourceId) {
  const normalized = String(value ?? "").trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) throw new Error(`Missing source observation time: ${sourceId}`);
  return new Date(normalized).toISOString();
}

function observation({ sourceId, category, record, country, metric, value, unit, observed, url, provenance, raw }) {
  const observedAt = sourceObservedAt(observed, sourceId);
  const normalized = {
    source_id: sourceId,
    source_record_id: record,
    category,
    country_iso3: country,
    partner_country_iso3: null,
    observed_at: observedAt,
    published_at: null,
    metric,
    value_numeric: value,
    value_text: null,
    unit,
    commodity: null,
    event_type: null,
    signal_type: "EXTERNAL_STATISTIC",
    source_url: url,
    provenance,
  };
  const stable = { ...normalized, provenance: Object.fromEntries(Object.entries(provenance ?? {}).filter(([key]) => key !== "retrieved_at")) };
  const normalizedHash = hash(stable);
  return {
    observation_id: `${sourceId}_${normalizedHash.slice(0, 32)}`,
    ...normalized,
    raw_hash: hash(raw),
    normalized_hash: normalizedHash,
    quality_status: "VERIFIED",
    commercial_eligibility_status: "UNVERIFIED",
    _raw_payload: raw,
  };
}

async function eia() {
  const source = governedSource("eia_api_v2");
  const key = env("EIA_API_KEY");
  const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${encodeURIComponent(key)}&frequency=monthly&data[]=price&facets[stateid][]=CO&length=12`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`EIA_HTTP_${response.status}`);
  const rows = (await response.json())?.response?.data ?? [];
  if (!rows.length) throw new Error("EIA_RETURNED_NO_ROWS");
  return rows.map((row) => {
    if (!/^\d{4}-\d{2}$/.test(String(row.period ?? ""))) throw new Error("EIA_PERIOD_INVALID");
    return observation({
      sourceId: source.source_id,
      category: source.category,
      record: `EIA:electricity-retail:${row.period}:CO`,
      country: "USA",
      metric: "electricity_retail_price",
      value: Number(row.price),
      unit: row["price-units"] ?? "cents_per_kwh",
      observed: `${row.period}-01T00:00:00.000Z`,
      url: "https://api.eia.gov/v2/electricity/retail-sales/data/",
      provenance: { provider: "U.S. Energy Information Administration", dataset: "Electricity Retail Sales", state: "CO", frequency: "monthly", retrieved_at: now },
      raw: row,
    });
  });
}

async function noaa() {
  const source = governedSource("noaa_ncei_cdo_api");
  const token = env("NOAA_NCEI_TOKEN");
  const url = "https://www.ncei.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&locationid=FIPS:US&startdate=2026-09-01&enddate=2026-09-02&limit=25";
  const response = await fetch(url, { headers: { token }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`NOAA_NCEI_HTTP_${response.status}`);
  const rows = (await response.json())?.results ?? [];
  if (!rows.length) throw new Error("NOAA_NCEI_RETURNED_NO_ROWS");
  return rows.map((row) => observation({
    sourceId: source.source_id,
    category: source.category,
    record: `NCEI:${row.datatype ?? "unknown"}:${row.date ?? "unknown"}:${row.station ?? "unknown"}`,
    country: "USA",
    metric: `noaa_${String(row.datatype ?? "observation").toLowerCase()}`,
    value: Number(row.value),
    unit: row.datatype ?? null,
    observed: row.date,
    url: "https://www.ncei.noaa.gov/cdo-web/api/v2/data",
    provenance: { provider: "NOAA National Centers for Environmental Information", dataset: "GHCND", station: row.station ?? null, datatype: row.datatype ?? null, retrieved_at: now },
    raw: row,
  }));
}

function bundleTimestamp(rows) {
  const latest = Math.max(...rows.map((row) => Date.parse(row.observed_at)).filter(Number.isFinite));
  if (!Number.isFinite(latest)) throw new Error("BUNDLE_TIMESTAMP_UNAVAILABLE");
  return new Date(latest).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function uuidFromHash(value) {
  const hex = value.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function durableNormalized(row) {
  const { _raw_payload, ...normalized } = row;
  return normalized;
}
function buildFragment(sourceId, rows) {
  const entries = rows.map((row) => {
    const rawBytes = Buffer.from(JSON.stringify(row._raw_payload));
    if (rawBytes.length > 2_000_000) throw new Error(`RAW_PAYLOAD_TOO_LARGE:${row.observation_id}`);
    return {
      observation_id: row.observation_id,
      raw_hash: row.raw_hash,
      payload_sha256: sha(rawBytes),
      normalized_sha256: hash(durableNormalized(row)),
      normalized_observation: durableNormalized(row),
      raw_payload: row._raw_payload,
    };
  }).sort((a, b) => a.observation_id.localeCompare(b.observation_id));
  const fingerprint = hash(entries.map(({ observation_id, raw_hash, payload_sha256, normalized_sha256 }) => ({ observation_id, raw_hash, payload_sha256, normalized_sha256 })));
  const key = `geomacro-evidence/v1/observation-bundles/${bundleTimestamp(rows)}-${fingerprint[0]}-${uuidFromHash(fingerprint)}.json.gz`;
  const bundle = {
    schema: "geomacro.observation-raw-bundle.v1",
    storage_mode: "gzip-fragment-bundle",
    compression: "gzip-9",
    source_id: sourceId,
    created_at: now,
    bundle_fingerprint: fingerprint,
    entries,
  };
  const bundleBytes = Buffer.from(JSON.stringify(bundle));
  const compressed = gzipSync(bundleBytes, { level: 9 });
  return { entries, fingerprint, key, bundle, bundleBytes, compressed };
}

async function archiveVerifiedFragment(sourceId, rows) {
  let selected = rows.slice(0, Math.min(MAX_FRAGMENT_MEMBERS, rows.length));
  let fragment = null;
  while (selected.length) {
    const candidate = buildFragment(sourceId, selected);
    if (candidate.bundleBytes.length <= MAX_FRAGMENT_UNCOMPRESSED_BYTES && candidate.compressed.length <= MAX_FRAGMENT_COMPRESSED_BYTES) {
      fragment = candidate;
      break;
    }
    selected = selected.slice(0, -1);
  }
  if (!fragment || !selected.length) throw new Error(`NO_SAFE_FRAGMENT_SIZE:${sourceId}`);
  await b2.put(fragment.key, fragment.compressed);
  const readback = await b2.get(fragment.key);
  if (readback.length !== fragment.compressed.length || sha(readback) !== sha(fragment.compressed)) throw new Error(`B2_FRAGMENT_READBACK_HASH_MISMATCH:${sourceId}`);
  const restoredBytes = gunzipSync(readback, { maxOutputLength: MAX_FRAGMENT_UNCOMPRESSED_BYTES + 1 });
  if (sha(restoredBytes) !== sha(fragment.bundleBytes)) throw new Error(`B2_FRAGMENT_RESTORE_MISMATCH:${sourceId}`);
  const restored = JSON.parse(restoredBytes.toString("utf8"));
  if (restored?.schema !== "geomacro.observation-raw-bundle.v1" || restored?.storage_mode !== "gzip-fragment-bundle" || restored?.bundle_fingerprint !== fragment.fingerprint || restored?.entries?.length !== fragment.entries.length) {
    throw new Error(`B2_FRAGMENT_SHAPE_MISMATCH:${sourceId}`);
  }
  for (const entry of restored.entries) {
    if (!entry?.normalized_observation || hash(entry.normalized_observation) !== entry.normalized_sha256 || sha(Buffer.from(JSON.stringify(entry.raw_payload))) !== entry.payload_sha256) {
      throw new Error(`B2_FRAGMENT_MEMBER_MISMATCH:${sourceId}`);
    }
  }
  return {
    consumed: selected.length,
    fragment: {
      key: fragment.key,
      sha256: sha(fragment.compressed),
      fingerprint: fragment.fingerprint,
      members: selected.length,
      uncompressed_bytes: fragment.bundleBytes.length,
      compressed_bytes: fragment.compressed.length,
      compression_ratio: Number((fragment.compressed.length / Math.max(1, fragment.bundleBytes.length)).toFixed(6)),
      readback_verified: true,
      contains_normalized_observations: true,
    },
  };
}

async function archiveSourceBatch(sourceId, rows) {
  if (!rows.length || rows.length > MAX_SOURCE_ROWS) throw new Error(`UNSAFE_SOURCE_ROW_COUNT:${sourceId}`);
  let pending = [...rows].sort((a, b) => a.observation_id.localeCompare(b.observation_id));
  const fragments = [];
  while (pending.length) {
    if (fragments.length >= MAX_FRAGMENTS_PER_SOURCE) throw new Error(`TOO_MANY_FRAGMENTS:${sourceId}`);
    const archived = await archiveVerifiedFragment(sourceId, pending);
    fragments.push(archived.fragment);
    pending = pending.slice(archived.consumed);
  }
  const fragmentSetSha256 = hash(fragments.map(({ key, sha256, fingerprint, members }) => ({ key, sha256, fingerprint, members })));
  const uncompressedBytes = fragments.reduce((sum, fragment) => sum + fragment.uncompressed_bytes, 0);
  const compressedBytes = fragments.reduce((sum, fragment) => sum + fragment.compressed_bytes, 0);
  return {
    source_id: sourceId,
    normalized_observations: rows.length,
    storage_mode: "gzip-fragment-bundles",
    fragment_count: fragments.length,
    fragment_set_sha256: fragmentSetSha256,
    fragments,
    uncompressed_bytes: uncompressedBytes,
    compressed_bytes: compressedBytes,
    compression_ratio: Number((compressedBytes / Math.max(1, uncompressedBytes)).toFixed(6)),
    b2_readback_verified: true,
    normalized_observations_durable_in_b2: true,
    supabase_dependency: false,
    supabase_mirror_attempted: false,
    supabase_raw_payload_written: false,
  };
}

const handlers = { eia_api_v2: eia, noaa_ncei_cdo_api: noaa };
const sourceIds = (process.env.SOURCE_INGESTION_SOURCES ?? "eia_api_v2,noaa_ncei_cdo_api").split(",").map((value) => value.trim()).filter(Boolean);
const summaries = [];
for (const sourceId of sourceIds) {
  if (!handlers[sourceId]) throw new Error(`UNSUPPORTED_SOURCE:${sourceId}`);
  const rows = await handlers[sourceId]();
  const summary = await archiveSourceBatch(sourceId, rows);
  summaries.push(summary);
  console.log(JSON.stringify({ ...summary, status: "PASS" }));
}

const checkpointSql = summaries.map((summary) => {
  const metadata = JSON.stringify({
    schema: "geomacro.governed-ingestion-checkpoint.v2",
    source_id: summary.source_id,
    normalized_observations: summary.normalized_observations,
    durable_payload_store: "backblaze-b2",
    normalized_data_store: "backblaze-b2",
    compact_control_store: "cloudflare-d1",
    storage_mode: summary.storage_mode,
    compression: "gzip-9",
    fragment_count: summary.fragment_count,
    fragment_set_sha256: summary.fragment_set_sha256,
    fragments: summary.fragments.map(({ key, sha256, fingerprint, members }) => ({ key, sha256, fingerprint, members })),
    uncompressed_bytes: summary.uncompressed_bytes,
    compressed_bytes: summary.compressed_bytes,
    compression_ratio: summary.compression_ratio,
    b2_readback_verified: true,
    normalized_observations_durable_in_b2: true,
    supabase_dependency: false,
  });
  return `INSERT INTO pipeline_checkpoint (pipeline,scope,status,last_attempt_at,last_success_at,cursor,metadata_json,updated_at) VALUES ('governed_source_ingestion',${sqlText(summary.source_id)},'PASS',${sqlText(now)},${sqlText(now)},${sqlText(summary.fragment_set_sha256)},${sqlText(metadata)},${sqlText(now)}) ON CONFLICT(pipeline,scope) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,cursor=excluded.cursor,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at;`;
}).join("\n");
writeFileSync(`${artifactDir}/d1-checkpoints.sql`, `${checkpointSql}\n`);

const result = {
  schema: "geomacro.governed-b2-first-ingestion.v2",
  status: "PASS",
  ingested_at: now,
  durable_payload_store: "backblaze-b2",
  normalized_data_store: "backblaze-b2",
  compact_control_store: "cloudflare-d1",
  storage_mode: "gzip-fragment-bundles",
  compression: "gzip-9",
  normalized_observations: summaries.reduce((sum, item) => sum + item.normalized_observations, 0),
  fragment_count: summaries.reduce((sum, item) => sum + item.fragment_count, 0),
  uncompressed_bytes: summaries.reduce((sum, item) => sum + item.uncompressed_bytes, 0),
  compressed_bytes: summaries.reduce((sum, item) => sum + item.compressed_bytes, 0),
  sources: summaries,
  b2_usage: b2.usage(),
  supabase_dependency: false,
  supabase_mirror_attempted: false,
  supabase_raw_payload_written: false,
  commercial_signals_changed: false,
  payment_performed: false,
  destructive_change: false,
};
result.compression_ratio = Number((result.compressed_bytes / Math.max(1, result.uncompressed_bytes)).toFixed(6));
writeFileSync(`${artifactDir}/verification-summary.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));

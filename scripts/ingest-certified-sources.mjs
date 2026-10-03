#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createB2Client } from "./ops/b2-s3-client.mjs";

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
const now = new Date().toISOString();
const artifactDir = "artifacts/governed-source-ingestion";
mkdirSync(artifactDir, { recursive: true });

const db = createClient(env("APP_SUPABASE_URL"), env("APP_SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const b2 = createB2Client({
  endpointUrl: env("B2_S3_ENDPOINT"),
  accessKey: env("B2_KEY_ID"),
  secretKey: env("B2_APPLICATION_KEY"),
  bucket: "geomacro-private-archive",
});

async function registry(sourceId) {
  const { data, error } = await db.from("live_external_sources").select("*").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Missing registry: ${sourceId}`);
  if (!data.enabled_for_ingestion) throw new Error(`Not enabled for ingestion: ${sourceId}`);
  if (data.enabled_for_commercial_signals && !["COMMERCIAL_OK", "DERIVED_ONLY"].includes(data.commercial_usage_status)) {
    throw new Error(`Unsafe commercial registry state: ${sourceId}`);
  }
  return data;
}

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
    // These feeds expose measurement/period time, not a separately verified publication timestamp.
    // Leave publication unknown instead of substituting ingestion time or observation time.
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
  const stable = {
    ...normalized,
    provenance: Object.fromEntries(Object.entries(provenance ?? {}).filter(([key]) => key !== "retrieved_at")),
  };
  const normalizedHash = hash(stable);
  return {
    observation_id: `${sourceId}_${normalizedHash.slice(0, 32)}`,
    ...normalized,
    _raw_payload: raw,
    raw_hash: hash(raw),
    normalized_hash: normalizedHash,
    quality_status: "VERIFIED",
    commercial_eligibility_status: "UNVERIFIED",
  };
}

async function eia() {
  const source = await registry("eia_api_v2");
  const key = env("EIA_API_KEY");
  const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${encodeURIComponent(key)}&frequency=monthly&data[]=price&facets[stateid][]=CO&length=12`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`EIA HTTP ${response.status}`);
  const rows = (await response.json())?.response?.data ?? [];
  if (!rows.length) throw new Error("EIA returned no rows");
  return rows.map((row) => {
    if (!/^\d{4}-\d{2}$/.test(String(row.period ?? ""))) throw new Error("EIA period missing or invalid");
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
  const source = await registry("noaa_ncei_cdo_api");
  const token = env("NOAA_NCEI_TOKEN");
  const url = "https://www.ncei.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&locationid=FIPS:US&startdate=2026-09-01&enddate=2026-09-02&limit=25";
  const response = await fetch(url, { headers: { token }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`NOAA NCEI HTTP ${response.status}`);
  const rows = (await response.json())?.results ?? [];
  if (!rows.length) throw new Error("NOAA NCEI returned no rows");
  return rows.map((row) => observation({
    sourceId: source.source_id,
    category: "MULTI_DOMAIN",
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

async function archiveSourceBatch(sourceId, rows) {
  if (!rows.length || rows.length > 250) throw new Error(`Unsafe bundle row count: ${sourceId}`);
  const entries = rows.map((row) => {
    const memberBytes = Buffer.from(JSON.stringify(row._raw_payload));
    if (memberBytes.length > 2_000_000) throw new Error(`Raw payload too large: ${row.observation_id}`);
    return {
      observation_id: row.observation_id,
      raw_hash: row.raw_hash,
      payload_sha256: sha(memberBytes),
      raw_payload: row._raw_payload,
    };
  }).sort((a, b) => a.observation_id.localeCompare(b.observation_id));
  const fingerprint = hash(entries.map(({ observation_id, raw_hash, payload_sha256 }) => ({ observation_id, raw_hash, payload_sha256 })));
  const key = `geomacro-evidence/v1/observation-bundles/${bundleTimestamp(rows)}-${fingerprint[0]}-${uuidFromHash(fingerprint)}.json.gz`;
  const bundle = {
    schema: "geomacro.observation-raw-bundle.v1",
    source_id: sourceId,
    created_at: rows.map((row) => row.observed_at).sort().at(-1),
    bundle_fingerprint: fingerprint,
    entries,
  };
  const bundleBytes = Buffer.from(JSON.stringify(bundle));
  if (bundleBytes.length > 8_000_000) throw new Error(`Bundle too large: ${sourceId}`);
  const compressed = gzipSync(bundleBytes, { level: 9 });
  await b2.put(key, compressed);
  const readback = await b2.get(key);
  if (sha(readback) !== sha(compressed)) throw new Error(`B2 readback hash mismatch: ${sourceId}`);
  const restoredBytes = gunzipSync(readback, { maxOutputLength: 10_000_000 });
  if (sha(restoredBytes) !== sha(bundleBytes)) throw new Error(`B2 restored bundle mismatch: ${sourceId}`);
  const restored = JSON.parse(restoredBytes.toString("utf8"));
  if (restored?.schema !== bundle.schema || restored?.bundle_fingerprint !== fingerprint || restored?.entries?.length !== entries.length) {
    throw new Error(`B2 restored bundle shape mismatch: ${sourceId}`);
  }

  const memberById = new Map(entries.map((entry) => [entry.observation_id, entry]));
  const compactRows = rows.map(({ _raw_payload, ...row }) => {
    const member = memberById.get(row.observation_id);
    if (!member) throw new Error(`Missing archived member: ${row.observation_id}`);
    return {
      ...row,
      raw_payload: null,
      archive_bundle_key: key,
      archive_bundle_sha256: sha(compressed),
      archive_member_sha256: member.payload_sha256,
    };
  });

  for (let offset = 0; offset < compactRows.length; offset += 100) {
    const chunk = compactRows.slice(offset, offset + 100);
    const { error } = await db.from("live_external_observations").upsert(chunk, {
      onConflict: "source_id,normalized_hash",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  const ids = compactRows.map((row) => row.observation_id);
  const { data: persisted, error: verifyError } = await db.from("live_external_observations")
    .select("observation_id,raw_payload,raw_hash,archive_bundle_key,archive_bundle_sha256,archive_member_sha256")
    .in("observation_id", ids);
  if (verifyError) throw verifyError;
  if ((persisted ?? []).length !== compactRows.length) throw new Error(`Compact mirror count mismatch: ${sourceId}`);
  const expectedById = new Map(compactRows.map((row) => [row.observation_id, row]));
  for (const row of persisted ?? []) {
    const expected = expectedById.get(row.observation_id);
    if (!expected || row.raw_payload !== null || row.raw_hash !== expected.raw_hash || row.archive_bundle_key !== key ||
        row.archive_bundle_sha256 !== expected.archive_bundle_sha256 || row.archive_member_sha256 !== expected.archive_member_sha256) {
      throw new Error(`Compact mirror verification failed: ${row.observation_id}`);
    }
  }

  return {
    source_id: sourceId,
    normalized_observations: compactRows.length,
    bundle_key: key,
    bundle_sha256: sha(compressed),
    bundle_fingerprint: fingerprint,
    b2_readback_verified: true,
    supabase_raw_payload_written: false,
    supabase_compact_mirror_verified: true,
  };
}

const handlers = { eia_api_v2: eia, noaa_ncei_cdo_api: noaa };
const sourceIds = (process.env.SOURCE_INGESTION_SOURCES ?? "eia_api_v2,noaa_ncei_cdo_api").split(",").map((value) => value.trim()).filter(Boolean);
const summaries = [];
for (const sourceId of sourceIds) {
  if (!handlers[sourceId]) throw new Error(`Unsupported source: ${sourceId}`);
  const rows = await handlers[sourceId]();
  const summary = await archiveSourceBatch(sourceId, rows);
  summaries.push(summary);
  console.log(JSON.stringify({ ...summary, status: "PASS" }));
}

const checkpointSql = summaries.map((summary) => {
  const metadata = JSON.stringify({
    schema: "geomacro.governed-ingestion-checkpoint.v1",
    source_id: summary.source_id,
    normalized_observations: summary.normalized_observations,
    durable_payload_store: "backblaze-b2",
    bundle_key: summary.bundle_key,
    bundle_sha256: summary.bundle_sha256,
    b2_readback_verified: true,
    supabase_raw_payload_written: false,
    supabase_compact_mirror_verified: true,
  });
  return `INSERT INTO pipeline_checkpoint (pipeline,scope,status,last_attempt_at,last_success_at,cursor,metadata_json,updated_at) VALUES ('governed_source_ingestion',${sqlText(summary.source_id)},'PASS',${sqlText(now)},${sqlText(now)},${sqlText(summary.bundle_fingerprint)},${sqlText(metadata)},${sqlText(now)}) ON CONFLICT(pipeline,scope) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,cursor=excluded.cursor,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at;`;
}).join("\n");
writeFileSync(`${artifactDir}/d1-checkpoints.sql`, `${checkpointSql}\n`);

const result = {
  schema: "geomacro.governed-b2-first-ingestion.v1",
  status: "PASS",
  ingested_at: now,
  durable_payload_store: "backblaze-b2",
  compact_control_store: "cloudflare-d1",
  normalized_observations: summaries.reduce((sum, item) => sum + item.normalized_observations, 0),
  sources: summaries,
  b2_usage: b2.usage(),
  supabase_raw_payload_written: false,
  commercial_signals_changed: false,
  payment_performed: false,
  destructive_change: false,
};
writeFileSync(`${artifactDir}/verification-summary.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));

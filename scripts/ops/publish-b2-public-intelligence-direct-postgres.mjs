#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  GDELT_DOC_EVIDENCE_CONTRACT,
  GDELT_DOC_SOURCE_TRANSPORT,
  readGdeltDocCurrentRows,
} from "./gdelt-doc-current-evidence.mjs";
import {
  GDELT_MASTERFILE_SOURCE_TRANSPORT,
  readGdeltMasterfileCurrentCandidates,
} from "./gdelt-masterfile-current-evidence.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const CURRENT_EVIDENCE_CONTRACT = "gdelt-v2-event-export-conflict-root-v1";
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const ROWS_PER_CATEGORY = 40;
const MAX_LIVE_OBSERVED_ROWS = 24;
const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const GDELT_LAST_UPDATE_URL = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const GDELT_FIPS_LOOKUP_URL = "https://www.gdeltproject.org/data/lookups/FIPS.country.txt";
const CONTROL_PLANE_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev";
const HOT_OVERLAY_KEY = "public_intelligence_live_observed_v1";
const HOT_OVERLAY_SCHEMA = "geomacro.public-intelligence-live-observed.v1";
const HOT_OVERLAY_MAX_BYTES = 30 * 1024;
const PUBLIC_INTELLIGENCE_EDGE_URL =
  "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence";
const PUBLIC_INTELLIGENCE_EDGE_AUTHORITY = "backblaze-b2-intelligence-edge";
const VERIFIED_BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const GDELT_EXPECTED_COLUMNS = 61;
const GDELT_FIELD = Object.freeze({
  GLOBAL_EVENT_ID: 0,
  EVENT_ROOT_CODE: 28,
  NUM_SOURCES: 32,
  NUM_ARTICLES: 33,
  ACTION_GEO_FULL_NAME: 52,
  ACTION_GEO_COUNTRY_CODE: 53,
  DATE_ADDED: 59,
});
const GDELT_CONFLICT_LABEL = Object.freeze({
  "13": "threat activity",
  "14": "protest activity",
  "15": "force-posture activity",
  "16": "relationship deterioration",
  "17": "coercive activity",
  "18": "assault activity",
  "19": "fighting",
  "20": "mass-violence activity",
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function controlPlaneToken() {
  const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (root.length < 32) throw new Error("GEOMACRO_COMMERCE_LEDGER_TOKEN_REQUIRED");
  return createHmac("sha256", root)
    .update("geomacro-control-plane-v1")
    .digest("hex");
}

async function publishHotOverlay(current, generatedAt, verifiedB2Sha256) {
  if (!/^[0-9a-f]{64}$/u.test(String(verifiedB2Sha256 ?? ""))) {
    throw new Error("PUBLIC_INTELLIGENCE_HOT_OVERLAY_B2_SHA_INVALID");
  }
  if (!Array.isArray(current?.rows) || current.rows.length < 1 || current.rows.length > MAX_LIVE_OBSERVED_ROWS) {
    throw new Error("PUBLIC_INTELLIGENCE_HOT_OVERLAY_ROWS_INVALID");
  }
  const rows = current.rows.map((row) => ({
    id: String(row.id),
    source_title: String(row.source_title),
    summary: row.summary == null ? null : String(row.summary),
    category: "geopolitics",
    severity: null,
    delta: null,
    created_at: String(row.created_at),
    published_at: row.published_at == null ? null : String(row.published_at),
    public_status: "live_observed",
  }));
  for (const row of rows) {
    if (
      !row.id ||
      !row.source_title.startsWith("Geomacro observes ") ||
      row.severity !== null ||
      row.delta !== null ||
      row.public_status !== "live_observed"
    ) throw new Error("PUBLIC_INTELLIGENCE_HOT_OVERLAY_ROW_INVALID");
  }

  const overlay = {
    schema: HOT_OVERLAY_SCHEMA,
    generated_at: generatedAt,
    source_id: "gdelt_v2_events",
    verified_b2_key: LIVE_KEY,
    verified_b2_sha256: verifiedB2Sha256,
    full_b2_readback_verified: true,
    exact_gzip_restore_verified: true,
    current_source_transport: current.sourceTransport,
    current_source_batch_at: current.batchIso,
    current_evidence_contract: current.evidenceContract,
    synthetic_score: false,
    raw_source_headlines_exposed: false,
    provider_identity_exposed: false,
    rows,
  };
  const encoded = Buffer.from(JSON.stringify(overlay), "utf8");
  if (encoded.length > HOT_OVERLAY_MAX_BYTES) {
    throw new Error(`PUBLIC_INTELLIGENCE_HOT_OVERLAY_TOO_LARGE:${encoded.length}`);
  }

  const response = await fetch(
    `${CONTROL_PLANE_URL}/v1/control/${HOT_OVERLAY_KEY}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${controlPlaneToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: overlay, version: 1 }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`PUBLIC_INTELLIGENCE_HOT_OVERLAY_WRITE_FAILED_${response.status}`);
  }
  const body = await response.json().catch(() => null);
  if (body?.ok !== true || body?.key !== HOT_OVERLAY_KEY) {
    throw new Error("PUBLIC_INTELLIGENCE_HOT_OVERLAY_WRITE_INVALID");
  }

  console.log(JSON.stringify({
    ok: true,
    schema: "geomacro.public-intelligence-hot-overlay-publish.v1",
    authority_serve: "cloudflare-d1-hot-overlay",
    current_source_batch_at: current.batchIso,
    current_source_transport: current.sourceTransport,
    current_evidence_contract: current.evidenceContract,
    live_observed_rows: rows.length,
    bytes: encoded.length,
    synthetic_score: false,
    raw_source_headlines_exposed: false,
    provider_identity_exposed: false,
  }));
}


function b2CapReason(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    message === "B2_DOWNLOAD_CAP_EXCEEDED" ||
    message.includes("B2_DOWNLOAD_CAP_EXCEEDED") ||
    message.includes("B2_NATIVE_GET_FAILED_403_download_cap_exceeded")
  ) return "B2_DOWNLOAD_CAP_EXCEEDED";
  if (
    message === "B2_TRANSACTION_CAP_EXCEEDED" ||
    message.includes("B2_TRANSACTION_CAP_EXCEEDED")
  ) return "B2_TRANSACTION_CAP_EXCEEDED";
  return null;
}

function validVerifiedEdgeBaselineRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 300) return false;
  const categories = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (
      "source_name" in row ||
      "source_domain" in row ||
      "source_url" in row ||
      "provider" in row ||
      "raw" in row ||
      "raw_payload" in row
    ) return false;
    if (row.public_status === "live_observed") continue;
    const category = String(row.category ?? "").trim().toLowerCase();
    const title = String(row.source_title ?? "").replace(/\s+/gu, " ").trim();
    const severity = Number(row.severity);
    if (
      !REQUIRED_CATEGORIES.includes(category) ||
      !String(row.id ?? "").trim() ||
      !title.startsWith("Geomacro finds ") ||
      !Number.isFinite(severity) ||
      severity < 0 ||
      severity > 100
    ) return false;
    categories.add(category);
  }
  return REQUIRED_CATEGORIES.every((category) => categories.has(category));
}

async function readVerifiedEdgeBaseline() {
  const response = await fetch(PUBLIC_INTELLIGENCE_EDGE_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`PUBLIC_INTELLIGENCE_VERIFIED_EDGE_HTTP_${response.status}`);
  }
  if (
    response.headers.get("x-geomacro-authority") !==
    PUBLIC_INTELLIGENCE_EDGE_AUTHORITY
  ) {
    throw new Error("PUBLIC_INTELLIGENCE_VERIFIED_EDGE_AUTHORITY_INVALID");
  }
  const b2Sha256 = String(
    response.headers.get("x-geomacro-b2-sha256") ?? "",
  ).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(b2Sha256)) {
    throw new Error("PUBLIC_INTELLIGENCE_VERIFIED_EDGE_B2_SHA_INVALID");
  }
  const payload = await response.json();
  const generatedAt = String(payload?.generated_at ?? "");
  const generatedMs = Date.parse(generatedAt);
  if (
    payload?.schema !== "geomacro.public-intelligence-live.v1" ||
    payload?.source_project !== PROJECT_REF ||
    !Number.isFinite(generatedMs) ||
    generatedMs > Date.now() + 5 * 60_000 ||
    Date.now() - generatedMs > VERIFIED_BASELINE_MAX_AGE_MS ||
    !validVerifiedEdgeBaselineRows(payload?.rows)
  ) {
    throw new Error("PUBLIC_INTELLIGENCE_VERIFIED_EDGE_BASELINE_INVALID");
  }
  return {
    generatedAt,
    b2Sha256,
    continuity:
      response.headers.get("x-geomacro-continuity") ===
      "github-actions-b2-readback-verified-projection",
  };
}

async function publishB2CapOverlayRecovery(current, error) {
  const reason = b2CapReason(error);
  if (!reason) throw error;
  const baseline = await readVerifiedEdgeBaseline();
  await publishHotOverlay(current, baseline.generatedAt, baseline.b2Sha256);
  const proof = {
    ok: true,
    schema: "geomacro.public-intelligence-overlay-recovery.v1",
    authority_read: "verified-intelligence-edge",
    authority_serve: "cloudflare-d1-hot-overlay",
    recovery_reason: reason,
    baseline_b2_readback_verified: true,
    baseline_b2_sha256: baseline.b2Sha256,
    baseline_generated_at: baseline.generatedAt,
    baseline_continuity_projection: baseline.continuity,
    current_b2_snapshot_promoted: false,
    current_source_id: "gdelt_v2_events",
    current_source_transport: current.sourceTransport,
    current_source_batch_at: current.batchIso,
    current_evidence_contract: current.evidenceContract,
    live_observed_rows: current.rows.length,
    live_observed_unscored: true,
    synthetic_score: false,
    raw_source_headlines_exposed: false,
    provider_identity_exposed: false,
    execution_authorized: false,
  };
  console.log(JSON.stringify(proof));
  return proof;
}

function authoritativeDbUrl() {
  const raw = String(process.env.SUPABASE_DB_URL ?? "").trim();
  if (!raw) throw new Error("SUPABASE_DB_URL_REQUIRED");
  let db;
  try {
    db = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL_INVALID");
  }
  const direct = db.hostname === `db.${PROJECT_REF}.supabase.co` && db.username === "postgres";
  const pooler = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT_REF}`;
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooler) ||
    !db.password ||
    db.pathname !== "/postgres"
  ) throw new Error("SUPABASE_DB_URL_NOT_AUTHORITATIVE");
  return raw;
}

function terminateSqlStatement(sql) {
  const statement = String(sql ?? "").trim().replace(/;+\s*$/u, "");
  if (!statement) throw new Error("PUBLIC_INTELLIGENCE_SQL_EMPTY");
  return `${statement};`;
}

function psqlRows(dbUrl, sql) {
  const wrapped = `
    begin read only;
    set local statement_timeout = '20s';
    set local lock_timeout = '5s';
    ${terminateSqlStatement(sql)}
    commit;
  `;
  const stdout = execFileSync(
    "psql",
    [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atqc", wrapped],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readScoredRows(dbUrl) {
  return psqlRows(
    dbUrl,
    `
      select row_to_json(t)::text
      from (
        with candidates as (
          select
            id,
            category,
            severity,
            delta,
            created_at,
            published_at,
            trim(regexp_replace(coalesce(narrative, ''), '\\s+', ' ', 'g')) as narrative_en,
            trim(regexp_replace(coalesce(summary, ''), '\\s+', ' ', 'g')) as summary_en
          from public.events
          where category in ('geopolitics','macro','rare_earth')
            and severity is not null
            and severity between 0 and 100
            and classification_version = '${CLASSIFICATION_VERSION}'
            and btrim(coalesce(narrative, '')) <> ''
            and lower(coalesce(source_name, '')) not like '%guardian%'
            and lower(coalesce(source_domain, '')) not in ('theguardian.com','www.theguardian.com')
            and coalesce(published_at, created_at) <= now() + interval '5 minutes'
            and created_at >= now() - interval '30 days'
        ), ranked as (
          select
            id,
            case
              when lower(narrative_en) like 'geomacro finds %' then narrative_en
              else 'Geomacro finds ' || regexp_replace(narrative_en, '[.!?]+$', '')
            end as source_title,
            nullif(summary_en, '') as summary,
            category,
            severity,
            delta,
            created_at,
            published_at,
            row_number() over (
              partition by category
              order by coalesce(published_at, created_at) desc, created_at desc, id desc
            ) as rn
          from candidates
        )
        select id,source_title,summary,category,severity,delta,created_at,published_at
        from ranked
        where rn <= ${ROWS_PER_CATEGORY}
        order by coalesce(published_at, created_at) desc, created_at desc
      ) t
    `,
  ).map((row) => ({ ...row, public_status: "verified_b2" }));
}

function requireCurrentSourceGovernance(dbUrl) {
  const rows = psqlRows(
    dbUrl,
    `
      select row_to_json(t)::text
      from (
        select
          s.source_id,
          s.category,
          s.commercial_usage_status,
          s.enabled_for_ingestion,
          s.enabled_for_commercial_signals,
          c.certification_state,
          c.endpoint_status,
          c.rights_status,
          c.schema_status,
          c.provenance_status,
          c.independence_status,
          c.adapter_status,
          c.runtime_status,
          c.fallback_status
        from public.live_external_sources s
        join public.live_source_certification_records c using (source_id)
        where s.source_id = 'gdelt_v2_events'
      ) t
    `,
  );
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row?.category !== "GEOPOLITICS" ||
    row?.commercial_usage_status !== "COMMERCIAL_OK" ||
    row?.enabled_for_ingestion !== true ||
    row?.enabled_for_commercial_signals !== true ||
    row?.certification_state !== "CERTIFIED" ||
    row?.endpoint_status !== "PASS" ||
    !["COMMERCIAL_OK", "DERIVED_ONLY"].includes(row?.rights_status) ||
    !["PASS", "NOT_APPLICABLE"].includes(row?.schema_status) ||
    !["PASS", "NOT_APPLICABLE"].includes(row?.provenance_status) ||
    !["PASS", "NOT_APPLICABLE"].includes(row?.independence_status) ||
    !["TESTED", "NOT_APPLICABLE"].includes(row?.adapter_status) ||
    !["PASS", "NOT_APPLICABLE"].includes(row?.runtime_status) ||
    !["READY", "NOT_REQUIRED"].includes(row?.fallback_status)
  ) {
    throw new Error("PUBLIC_INTELLIGENCE_CURRENT_GDELT_GOVERNANCE_INVALID");
  }
}

async function fetchWithRetry(url, accept) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Geomacro-Public-Current-Evidence/1.0 (+https://geomacro.live)",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      lastError = new Error(`CURRENT_EVIDENCE_HTTP_${response.status}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** (attempt - 1)));
  }
  throw lastError ?? new Error("CURRENT_EVIDENCE_FETCH_FAILED");
}

const GDELT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function parseGdeltTimestamp(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseLastUpdate(text, asOf = new Date()) {
  const candidates = String(text)
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 3)
    .map(([size, md5, url]) => ({ size: Number(size), md5: String(md5).toLowerCase(), url: String(url) }))
    .filter((row) => Number.isInteger(row.size) && row.size > 0 && /^[0-9a-f]{32}$/u.test(row.md5) && row.url.endsWith(".export.CSV.zip"))
    .flatMap((row) => {
      try {
        const listed = new URL(row.url);
        if (
          !["http:", "https:"].includes(listed.protocol) ||
          listed.hostname !== "data.gdeltproject.org" ||
          !/^\/gdeltv2\/\d{14}\.export\.CSV\.zip$/u.test(listed.pathname)
        ) return [];
        const stamp = /\/(\d{14})\.export\.CSV\.zip$/u.exec(listed.pathname)?.[1];
        const batchIso = stamp ? parseGdeltTimestamp(stamp) : null;
        return batchIso ? [{ ...row, listed, batchIso }] : [];
      } catch {
        return [];
      }
    })
    .filter((row) => Date.parse(row.batchIso) <= asOf.getTime() + GDELT_FUTURE_TOLERANCE_MS)
    .sort((a, b) => Date.parse(b.batchIso) - Date.parse(a.batchIso));
  const selected = candidates[0];
  if (!selected) throw new Error("CURRENT_GDELT_EXPORT_UNAVAILABLE");
  return {
    size: selected.size,
    md5: selected.md5,
    batchIso: selected.batchIso,
    listedUrl: selected.url,
    secureUrl: `https://data.gdeltproject.org${selected.listed.pathname}`,
  };
}

function parseFipsLookup(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const [codeRaw, ...nameParts] = line.split("\t");
    const code = String(codeRaw ?? "").trim().toUpperCase();
    const name = nameParts.join("\t").replace(/\s+/gu, " ").trim();
    if (/^[A-Z]{2}$/u.test(code) && name) map.set(code, name);
  }
  if (map.size < 200) throw new Error(`CURRENT_GDELT_FIPS_LOOKUP_TOO_SMALL:${map.size}`);
  return map;
}

function unzipUtf8(zipBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "geomacro-current-gdelt-"));
  const zipPath = join(dir, "batch.zip");
  try {
    writeFileSync(zipPath, zipBuffer);
    return execFileSync("unzip", ["-p", zipPath], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function cleanPublicText(value, max = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function buildLiveObservedRows(exportText, fipsLookup, now = Date.now()) {
  const lines = String(exportText).split(/\r?\n/u).filter(Boolean);
  if (!lines.length) throw new Error("CURRENT_GDELT_EXPORT_EMPTY");
  const malformed = [];
  const byKey = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const fields = lines[index].split("\t");
    if (fields.length !== GDELT_EXPECTED_COLUMNS) {
      malformed.push(index);
      continue;
    }
    const id = String(fields[GDELT_FIELD.GLOBAL_EVENT_ID] ?? "").trim();
    const root = String(fields[GDELT_FIELD.EVENT_ROOT_CODE] ?? "").trim();
    const observedAt = parseGdeltTimestamp(fields[GDELT_FIELD.DATE_ADDED]);
    const countryCode = String(fields[GDELT_FIELD.ACTION_GEO_COUNTRY_CODE] ?? "").trim().toUpperCase();
    const countryName = cleanPublicText(fipsLookup.get(countryCode) ?? "", 100);
    const actionPlace = cleanPublicText(fields[GDELT_FIELD.ACTION_GEO_FULL_NAME], 140);
    const label = GDELT_CONFLICT_LABEL[root];
    if (!/^\d+$/u.test(id) || !label || !observedAt || !countryName) continue;
    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs) || observedMs > now + 5 * 60_000 || now - observedMs > LIVE_MAX_AGE_MS) continue;
    const place = actionPlace || countryName;
    const countrySuffix = place.toLowerCase().includes(countryName.toLowerCase()) ? "" : `, ${countryName}`;
    const title = `Geomacro observes ${label} in ${place}${countrySuffix}`.slice(0, 280).trim();
    const summary = `Verified current conflict-event metadata indicates ${label} in ${place}${countrySuffix}. No Geomacro severity score has been assigned.`;
    const numSources = Number(fields[GDELT_FIELD.NUM_SOURCES]);
    const numArticles = Number(fields[GDELT_FIELD.NUM_ARTICLES]);
    const dedupeKey = `${root}|${place.toLowerCase()}|${countryName.toLowerCase()}`;
    const candidate = {
      id: `live_gdelt_${id}`,
      source_title: title,
      summary,
      category: "geopolitics",
      severity: null,
      delta: null,
      created_at: observedAt,
      published_at: observedAt,
      public_status: "live_observed",
      _numSources: Number.isFinite(numSources) ? numSources : 0,
      _numArticles: Number.isFinite(numArticles) ? numArticles : 0,
    };
    const previous = byKey.get(dedupeKey);
    if (
      !previous ||
      candidate._numSources > previous._numSources ||
      (candidate._numSources === previous._numSources && candidate._numArticles > previous._numArticles)
    ) byKey.set(dedupeKey, candidate);
  }

  if (malformed.length > Math.max(5, Math.floor(lines.length * 0.01))) {
    throw new Error(`CURRENT_GDELT_SCHEMA_REJECTED_TOO_MANY_ROWS:${malformed.length}/${lines.length}`);
  }

  return [...byKey.values()]
    .sort((a, b) =>
      Date.parse(b.published_at) - Date.parse(a.published_at) ||
      b._numSources - a._numSources ||
      b._numArticles - a._numArticles ||
      a.id.localeCompare(b.id),
    )
    .slice(0, MAX_LIVE_OBSERVED_ROWS)
    .map(({ _numSources, _numArticles, ...row }) => row);
}

async function readGdeltEventExport(exportMeta, sourceTransport) {
  const batchAgeMs = Date.now() - Date.parse(exportMeta.batchIso);
  if (
    !Number.isFinite(batchAgeMs) ||
    batchAgeMs < -GDELT_FUTURE_TOLERANCE_MS ||
    batchAgeMs > LIVE_MAX_AGE_MS
  ) {
    throw new Error(`CURRENT_GDELT_BATCH_STALE:${Math.round(batchAgeMs / 60_000)}`);
  }

  const exportResponse = await fetchWithRetry(
    exportMeta.secureUrl,
    "application/zip,application/octet-stream",
  );
  const zip = Buffer.from(await exportResponse.arrayBuffer());
  if (zip.length !== exportMeta.size) {
    throw new Error(`CURRENT_GDELT_EXPORT_SIZE_MISMATCH:${exportMeta.size}:${zip.length}`);
  }
  const md5 = createHash("md5").update(zip).digest("hex");
  if (md5 !== exportMeta.md5) throw new Error("CURRENT_GDELT_EXPORT_MD5_MISMATCH");

  const fipsResponse = await fetchWithRetry(
    GDELT_FIPS_LOOKUP_URL,
    "text/plain,*/*;q=0.1",
  );
  const fipsText = await fipsResponse.text();
  const fipsLookup = parseFipsLookup(fipsText);

  const rows = buildLiveObservedRows(unzipUtf8(zip), fipsLookup);
  if (!rows.length) throw new Error("CURRENT_GDELT_NO_ELIGIBLE_LIVE_OBSERVATIONS");
  return {
    rows,
    batchIso: exportMeta.batchIso,
    exportMd5: exportMeta.md5,
    fipsSha256: sha256(Buffer.from(fipsText, "utf8")),
    sourceDigest: exportMeta.md5,
    evidenceContract: CURRENT_EVIDENCE_CONTRACT,
    sourceTransport,
  };
}

async function readCurrentGdeltRows() {
  const lastUpdate = await fetchWithRetry(
    GDELT_LAST_UPDATE_URL,
    "text/plain,*/*;q=0.1",
  );
  const exportMeta = parseLastUpdate(await lastUpdate.text());
  return readGdeltEventExport(exportMeta, "event_export");
}

async function readCurrentGdeltMasterfileRows() {
  const { candidates } = await readGdeltMasterfileCurrentCandidates();
  let unavailableCount = 0;

  for (const candidate of candidates) {
    try {
      return await readGdeltEventExport(
        candidate,
        GDELT_MASTERFILE_SOURCE_TRANSPORT,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message === "CURRENT_EVIDENCE_HTTP_404" ||
        message === "CURRENT_GDELT_NO_ELIGIBLE_LIVE_OBSERVATIONS"
      ) {
        unavailableCount += 1;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `CURRENT_GDELT_MASTERFILE_EXPORTS_UNAVAILABLE:${unavailableCount}`,
  );
}

function eventExportTransportUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "CURRENT_GDELT_EXPORT_UNAVAILABLE" ||
    message.startsWith("CURRENT_GDELT_BATCH_STALE:") ||
    /^CURRENT_EVIDENCE_HTTP_(404|429|5\\d\\d)$/u.test(message) ||
    /fetch failed|timeout|timed out|aborted/iu.test(message)
  );
}

function masterfileFallbackTransportUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "CURRENT_GDELT_MASTERFILE_CONTENT_RANGE_INVALID" ||
    message === "CURRENT_GDELT_MASTERFILE_NO_CURRENT_EXPORTS" ||
    message.startsWith("CURRENT_GDELT_MASTERFILE_EXPORTS_UNAVAILABLE:") ||
    /^CURRENT_GDELT_MASTERFILE_RANGE_HTTP_(404|416|429|5\\d\\d)$/u.test(message) ||
    message.startsWith("CURRENT_GDELT_MASTERFILE_FETCH_FAILED:") ||
    /fetch failed|timeout|timed out|aborted/iu.test(message)
  );
}

function docFallbackTransportUnavailable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "CURRENT_GDELT_DOC_ARTICLES_EMPTY" ||
    message === "CURRENT_GDELT_DOC_NO_CORROBORATED_COVERAGE" ||
    /^CURRENT_GDELT_DOC_HTTP_(429|5\\d\\d)$/u.test(message) ||
    message.startsWith("CURRENT_GDELT_DOC_FETCH_FAILED:") ||
    /fetch failed|timeout|timed out|aborted/iu.test(message)
  );
}

async function readCurrentGdeltEvidence() {
  try {
    return await readCurrentGdeltRows();
  } catch (error) {
    if (!eventExportTransportUnavailable(error)) throw error;
    const primaryMessage = error instanceof Error ? error.message : String(error);

    try {
      const masterfileFallback = await readCurrentGdeltMasterfileRows();
      console.error(JSON.stringify({
        ok: true,
        degraded_transport: true,
        primary_transport_error: primaryMessage,
        fallback_transport: GDELT_MASTERFILE_SOURCE_TRANSPORT,
        fallback_contract: CURRENT_EVIDENCE_CONTRACT,
        fallback_rows: masterfileFallback.rows.length,
      }));
      return masterfileFallback;
    } catch (masterfileError) {
      const masterfileMessage =
        masterfileError instanceof Error ? masterfileError.message : String(masterfileError);
      if (!masterfileFallbackTransportUnavailable(masterfileError)) {
        throw new Error(`CURRENT_GDELT_MASTERFILE_FALLBACK_INVALID:${masterfileMessage}`);
      }

      try {
        const docFallback = await readGdeltDocCurrentRows();
        console.error(JSON.stringify({
          ok: true,
          degraded_transport: true,
          primary_transport_error: primaryMessage,
          masterfile_transport_error: masterfileMessage,
          fallback_transport: GDELT_DOC_SOURCE_TRANSPORT,
          fallback_contract: GDELT_DOC_EVIDENCE_CONTRACT,
          fallback_rows: docFallback.rows.length,
        }));
        return docFallback;
      } catch (docError) {
        const docMessage = docError instanceof Error ? docError.message : String(docError);
        if (!docFallbackTransportUnavailable(docError)) {
          throw new Error(`CURRENT_GDELT_DOC_FALLBACK_INVALID:${docMessage}`);
        }
        throw new Error(
          `CURRENT_GDELT_EXPORT_UNAVAILABLE;MASTERFILE_FALLBACK_FAILED:${masterfileMessage};DOC_FALLBACK_FAILED:${docMessage}`,
        );
      }
    }
  }
}

function assertB2Config() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY
  ) throw new Error("B2_PUBLIC_INTELLIGENCE_CONFIG_REQUIRED");
}

function rowTime(row) {
  const value = row?.published_at ?? row?.created_at;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > REQUIRED_CATEGORIES.length * ROWS_PER_CATEGORY + MAX_LIVE_OBSERVED_ROWS) {
    throw new Error("PUBLIC_INTELLIGENCE_ROW_COUNT_INVALID");
  }
  const seen = new Set();
  const scoredCategories = new Set();
  let liveObserved = 0;
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const title = String(row?.source_title ?? "").trim();
    const category = String(row?.category ?? "").trim();
    const status = String(row?.public_status ?? "").trim();
    if (!id || !title || !REQUIRED_CATEGORIES.includes(category)) throw new Error("PUBLIC_INTELLIGENCE_ROW_SHAPE_INVALID");
    if ("source_name" in row || "source_domain" in row || "source_url" in row) {
      throw new Error("PUBLIC_INTELLIGENCE_SOURCE_IDENTITY_EXPOSED");
    }
    if (status === "verified_b2") {
      const severity = Number(row?.severity);
      if (!title.startsWith("Geomacro finds ")) throw new Error("PUBLIC_INTELLIGENCE_DERIVED_TITLE_INVALID");
      if (!Number.isFinite(severity) || severity < 0 || severity > 100) throw new Error("PUBLIC_INTELLIGENCE_SCORED_ROW_INVALID");
      scoredCategories.add(category);
    } else if (status === "live_observed") {
      if (category !== "geopolitics" || !title.startsWith("Geomacro observes ") || row?.severity !== null || row?.delta !== null) {
        throw new Error("PUBLIC_INTELLIGENCE_LIVE_OBSERVED_ROW_INVALID");
      }
      const timestamp = rowTime(row);
      if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000 || Date.now() - timestamp > LIVE_MAX_AGE_MS) {
        throw new Error("PUBLIC_INTELLIGENCE_LIVE_OBSERVED_TIME_INVALID");
      }
      liveObserved += 1;
    } else {
      throw new Error("PUBLIC_INTELLIGENCE_PUBLIC_STATUS_INVALID");
    }
    const key = `${category}|${title.toLowerCase().replace(/\s+/gu, " ")}`;
    if (seen.has(key)) throw new Error("PUBLIC_INTELLIGENCE_DUPLICATE_ROW");
    seen.add(key);
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (!scoredCategories.has(category)) throw new Error(`PUBLIC_INTELLIGENCE_SCORED_CATEGORY_MISSING_${category}`);
  }
  if (liveObserved < 1) throw new Error("PUBLIC_INTELLIGENCE_CURRENT_EVIDENCE_MISSING");
}

const dbUrl = authoritativeDbUrl();
assertB2Config();
requireCurrentSourceGovernance(dbUrl);
const scoredRows = readScoredRows(dbUrl);
const current = await readCurrentGdeltEvidence();
const rows = [...current.rows, ...scoredRows]
  .sort((a, b) => rowTime(b) - rowTime(a));
validateRows(rows);

const generatedAt = new Date().toISOString();
const value = {
  schema: "geomacro.public-intelligence-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  scoring_policy: "canonical-scored-plus-certified-current-unscored",
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: current.evidenceContract,
  public_language: "en",
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  rows,
};
const raw = Buffer.from(JSON.stringify(value));
const packed = gzipSync(raw, { level: 9 });
const digest = sha256(packed);

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

try {
  await b2.get(PROOF_KEY);
} catch (error) {
  if (b2CapReason(error)) {
    await publishB2CapOverlayRecovery(current, error);
    process.exit(0);
  }
  throw error;
}

await b2.put(LIVE_KEY, packed);
let readback;
try {
  readback = await b2.get(LIVE_KEY);
} catch (error) {
  if (b2CapReason(error)) {
    await publishB2CapOverlayRecovery(current, error);
    process.exit(0);
  }
  throw error;
}
if (readback.length !== packed.length || sha256(readback) !== digest) {
  throw new Error("B2_PUBLIC_INTELLIGENCE_HASH_INVALID");
}
let restored;
try {
  restored = JSON.parse(gunzipSync(readback).toString("utf8"));
} catch {
  throw new Error("B2_PUBLIC_INTELLIGENCE_RESTORE_INVALID");
}
validateRows(restored?.rows);
if (
  restored?.schema !== value.schema ||
  restored?.generated_at !== generatedAt ||
  restored?.source_project !== PROJECT_REF ||
  restored?.scoring_policy !== value.scoring_policy ||
  restored?.classification_version !== CLASSIFICATION_VERSION ||
  restored?.current_evidence_contract !== current.evidenceContract ||
  restored?.public_language !== "en" ||
  restored?.raw_source_headlines_exposed !== false ||
  restored?.provider_identity_exposed !== false
) throw new Error("B2_PUBLIC_INTELLIGENCE_BINDING_INVALID");

const verifiedRows = rows.filter((row) => row.public_status === "verified_b2").length;
const liveObservedRows = rows.filter((row) => row.public_status === "live_observed").length;
const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.public-intelligence-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: current.evidenceContract,
  current_source_id: "gdelt_v2_events",
  current_source_transport: current.sourceTransport,
  current_source_batch_at: current.batchIso,
  current_source_digest: current.sourceDigest,
  current_source_export_md5: current.exportMd5,
  current_source_fips_sha256: current.fipsSha256,
  categories: REQUIRED_CATEGORIES,
  row_count: rows.length,
  verified_scored_rows: verifiedRows,
  live_observed_rows: liveObservedRows,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  scored_only: false,
  live_observed_unscored: true,
  real_event_timestamps_preserved: true,
  public_language: "en",
  derived_titles_only: true,
  guardian_commercial_dependency: false,
  raw_source_headlines_exposed: false,
  provider_identity_exposed: false,
  synthetic_score: false,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
}));
await b2.put(PROOF_KEY, proof);
let proofReadback;
try {
  proofReadback = await b2.get(PROOF_KEY);
} catch (error) {
  if (b2CapReason(error)) {
    await publishB2CapOverlayRecovery(current, error);
    process.exit(0);
  }
  throw error;
}
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_PUBLIC_INTELLIGENCE_PROOF_READBACK_INVALID");
await publishHotOverlay(current, generatedAt, digest);

const newest = rows.map(rowTime).filter(Number.isFinite).sort((a, b) => b - a)[0];
console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-intelligence-direct-postgres-publish.v2",
  authority_read: `direct-postgres-scored-plus-certified-gdelt-${current.sourceTransport}`,
  authority_serve: "backblaze-b2",
  classification_version: CLASSIFICATION_VERSION,
  current_evidence_contract: current.evidenceContract,
  current_source_transport: current.sourceTransport,
  scored_only: false,
  live_observed_unscored: true,
  public_language: "en",
  derived_titles_only: true,
  guardian_commercial_dependency: false,
  categories: REQUIRED_CATEGORIES,
  rows_published: rows.length,
  verified_scored_rows: verifiedRows,
  live_observed_rows: liveObservedRows,
  newest_row_at: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
  current_source_batch_at: current.batchIso,
  live_key: LIVE_KEY,
  proof_key: PROOF_KEY,
  live_sha256: digest,
  destructive_change: false,
  synthetic_score: false,
  b2_readback_verified: true,
}));

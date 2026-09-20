#!/usr/bin/env node
/**
 * Permanent source-specific evidence graph collector and guarded promoter.
 *
 * Every registered source receives one evidence node for each required
 * certification dimension. Only VERIFIED/OBSERVED evidence can promote.
 * Rights are never inferred from endpoint reachability.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "./commercial-source-rights-evidence.mjs";

const PROJECT = process.env.EXPECTED_SUPABASE_PROJECT_REF || "ldpwajisioljyjtojvfx";
const SUPABASE_PROJECT_ID = String(process.env.SUPABASE_PROJECT_ID || PROJECT).trim();
const SUPABASE_URL = String(
  process.env.APP_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ("https://" + SUPABASE_PROJECT_ID + ".supabase.co")
).trim();
const SERVICE_ROLE_KEY = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "",
).trim();
const CODE_REVISION = String(
  process.env.GITHUB_SHA || process.env.CODE_REVISION || "local",
).trim();
const ACTOR = String(
  process.env.GITHUB_ACTOR || process.env.CERTIFICATION_ACTOR || "geomacro-evidence-automation",
).trim();
const CONCURRENCY = Math.max(4, Number(process.env.SOURCE_EVIDENCE_CONCURRENCY || 16));
const TIMEOUT_MS = Math.max(3000, Number(process.env.SOURCE_EVIDENCE_TIMEOUT_MS || 12000));
const MAX_BODY_BYTES = Math.max(8192, Number(process.env.SOURCE_EVIDENCE_MAX_BODY_BYTES || 65536));
const OUT_DIR = path.join(process.cwd(), "artifacts", "source-certification-evidence-graph");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Authoritative Supabase URL and service-role key are required");
}
const parsed = new URL(SUPABASE_URL);
if (parsed.protocol !== "https:") throw new Error("Refusing non-HTTPS Supabase URL");
if (SUPABASE_PROJECT_ID !== PROJECT) {
  throw new Error("Refusing Supabase project ID " + SUPABASE_PROJECT_ID + "; expected " + PROJECT);
}
if (parsed.hostname !== PROJECT + ".supabase.co") {
  throw new Error("Refusing Supabase project " + parsed.hostname + "; expected " + PROJECT + ".supabase.co");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await fs.mkdir(OUT_DIR, { recursive: true });

async function fetchAll(table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from(table)
      .select(select || "*")
      .range(from, from + pageSize - 1);
    if (result.error) throw new Error("Failed to read " + table + ": " + result.error.message);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function canonicalObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  const out = {};
  for (const key of keys) out[key] = value[key];
  return JSON.stringify(out);
}

function stripHtml(input) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function samePublisherHost(baseUrl, finalUrl) {
  const base = hostnameOf(baseUrl);
  const final = hostnameOf(finalUrl);
  if (!base || !final) return false;
  return final === base || final.endsWith("." + base) || base.endsWith("." + final);
}

function timestampToIso(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length === 10 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function latestTimestampFromText(text) {
  const candidates = [];
  const re = /(?:updated|update_time|last_updated|published|publication_date|pubdate|date|datetime|timestamp|observed_at|created_at)\s*["'=:\>]\s*["']?([0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T ]|\s+)[0-9:.-]+(?:Z|[+\-][0-9:]{2}(?::?[0-9]{2})?)?)/gi;
  for (const m of String(text || "").matchAll(re)) {
    const iso = timestampToIso(m[1]);
    if (iso) candidates.push(iso);
  }
  for (const m of String(text || "").matchAll(/<(?:updated|published|pubDate|dc:date)[^>]*>\s*([^<]+)\s*<\/[^>]+>/gi)) {
    const iso = timestampToIso(m[1]);
    if (iso) candidates.push(iso);
  }
  return candidates.sort().at(-1) || null;
}

const freshnessSeconds = {
  NEAR_REAL_TIME: 6 * 60 * 60,
  PERIODIC: 14 * 24 * 60 * 60,
  ANNUAL: 400 * 24 * 60 * 60,
  SOURCE_DEPENDENT: 90 * 24 * 60 * 60,
  VARIABLE: 30 * 24 * 60 * 60,
};

function freshnessThreshold(source) {
  return freshnessSeconds[source.freshness_class] || 30 * 24 * 60 * 60;
}

async function readResponseBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const read = await reader.read();
      if (read.done) break;
      const remaining = MAX_BODY_BYTES - total;
      const chunk = read.value.byteLength > remaining ? read.value.slice(0, remaining) : read.value;
      chunks.push(Buffer.from(chunk));
      total += chunk.byteLength;
      if (chunk.byteLength < read.value.byteLength) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function httpProbe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    let method = "HEAD";
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Geomacro-Source-Evidence/1.0", accept: "*/*" },
    });
    if (response.status === 403 || response.status === 405 || response.status === 501) {
      method = "GET";
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Geomacro-Source-Evidence/1.0",
          accept: "*/*",
          range: "bytes=0-" + String(MAX_BODY_BYTES - 1),
        },
      });
    }
    let body = "";
    if (method === "GET") {
      body = await readResponseBody(response);
    } else if (response.status >= 200 && response.status < 400) {
      try {
        const verify = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": "Geomacro-Source-Evidence/1.0",
            accept: "*/*",
            range: "bytes=0-" + String(MAX_BODY_BYTES - 1),
          },
        });
        if (verify.status >= 200 && verify.status < 400) {
          body = await readResponseBody(verify);
        }
      } catch {}
    }
    return {
      requested_url: url,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get("content-type"),
      content_length: response.headers.get("content-length"),
      last_modified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
      cache_control: response.headers.get("cache-control"),
      age: response.headers.get("age"),
      method,
      body,
      latency_ms: Date.now() - started,
      ok_transport: response.status >= 200 && response.status < 400,
      error: null,
    };
  } catch (error) {
    return {
      requested_url: url,
      status: null,
      final_url: null,
      content_type: null,
      content_length: null,
      last_modified: null,
      etag: null,
      cache_control: null,
      age: null,
      method: null,
      body: "",
      latency_ms: Date.now() - started,
      ok_transport: false,
      error: String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function httpGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Geomacro-Source-Evidence/1.0",
        accept: "text/html,application/xhtml+xml,*/*",
        range: "bytes=0-" + String(MAX_BODY_BYTES - 1),
      },
    });
    const body = await readResponseBody(response);
    return {
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get("content-type"),
      body,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function schemaEvidence(probe, source) {
  const ct = String(probe.content_type || "").toLowerCase();
  const body = String(probe.body || "");
  const structuredType =
    /json|xml|rss|csv|tab-separated-values|sdmx/i.test(ct) ||
    /\.(json|xml|rss|csv|tsv)(?:$|[?#])/i.test(probe.final_url || probe.requested_url || "");
  if (!probe.ok_transport) {
    return { status: "FAIL", strength: "OBSERVED", schema_status: "FAIL", claim: "Endpoint did not return a usable transport response." };
  }
  if (/json/i.test(ct)) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
        return {
          status: "PASS",
          strength: "OBSERVED",
          schema_status: "PASS",
          claim: "Endpoint returned parseable JSON in the observed response window.",
          details: { json_root_type: Array.isArray(parsed) ? "array" : "object" },
        };
      }
    } catch {}
    return { status: "FAIL", strength: "OBSERVED", schema_status: "FAIL", claim: "Endpoint advertised JSON but the observed response window was not valid JSON." };
  }
  if (/csv|tab-separated/i.test(ct) || /\.(csv|tsv)(?:$|[?#])/i.test(probe.final_url || "")) {
    const line = body.split(/\r?\n/).find(Boolean) || "";
    if (line.split(/[,;\t]/).length >= 2) {
      return { status: "PASS", strength: "OBSERVED", schema_status: "PASS", claim: "Observed delimited-data header is parseable." };
    }
    return { status: "FAIL", strength: "OBSERVED", schema_status: "FAIL", claim: "Observed delimited-data response does not contain a parseable header." };
  }
  if (structuredType && /^\s*<[^>]+>/.test(body)) {
    return { status: "PASS", strength: "OBSERVED", schema_status: "PASS", claim: "Observed XML/RSS/SDMX response has a parseable root element." };
  }
  if (/html/i.test(ct) || /<html/i.test(body)) {
    return {
      status: "FAIL",
      strength: "OBSERVED",
      schema_status: "FAIL",
      claim: "Observed endpoint is an HTML page; a source-specific machine schema/adapter was not proven by the transport probe.",
      details: { access_type: source.access_type },
    };
  }
  return { status: "FAIL", strength: "OBSERVED", schema_status: "FAIL", claim: "No production-safe machine schema was proven from the observed response." };
}

function governedScopeKey(row) {
  return [
    row.scope_type,
    row.scope_code,
    row.module_id || "",
  ].join("|");
}

function explicitRightsFromText(text) {
  const clean = stripHtml(text).slice(0, 20000);
  const patterns = [
    { status: "COMMERCIAL_OK", re: /creative commons attribution(?: 4\.0)?/i, reason: "Explicit Creative Commons Attribution licensing text." },
    { status: "COMMERCIAL_OK", re: /\bcc by(?: 4\.0)?\b/i, reason: "Explicit CC BY licensing text." },
    { status: "COMMERCIAL_OK", re: /public domain/i, reason: "Explicit public-domain statement." },
    { status: "COMMERCIAL_OK", re: /commercial (?:use|reuse) (?:is )?(?:permitted|allowed)/i, reason: "Explicit commercial-use permission." },
    { status: "COMMERCIAL_OK", re: /(?:reuse|re-use) (?:is )?(?:permitted|allowed) for commercial/i, reason: "Explicit commercial reuse permission." },
    { status: "INTERNAL_RESEARCH_ONLY", re: /non-commercial(?: use| purposes)? only/i, reason: "Explicit non-commercial limitation." },
    { status: "PERMISSION_REQUIRED", re: /permission (?:is )?required.*(?:commercial|reuse|reproduction)/i, reason: "Explicit permission requirement for reuse." },
  ];
  for (const p of patterns) {
    if (p.re.test(clean)) {
      return { status: p.status, reason: p.reason, excerpt: clean.match(p.re)?.[0] || clean.slice(0, 320) };
    }
  }
  return null;
}

async function discoverRights(source, endpointProbe) {
  const manifest = COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[source.source_id];
  if (manifest?.approved_status === "VERIFIED") {
    return {
      status: "PASS",
      strength: "VERIFIED",
      rights_status: "COMMERCIAL_OK",
      method: "reviewed-commercial-source-rights-manifest",
      evidence_ref: manifest.terms_url,
      evidence_hash: sha256(JSON.stringify(manifest)),
      claim: "Source is covered by Geomacro's reviewed rights manifest for the exact dataset/source contract: " + manifest.dataset + ".",
      details: {
        provider: manifest.provider,
        dataset: manifest.dataset,
        licence: manifest.licence,
        terms_url: manifest.terms_url,
        dataset_url: manifest.dataset_url,
        raw_redistribution_allowed: manifest.raw_redistribution_allowed,
        boundary: manifest.boundary,
        customer_delivery_mode: manifest.customer_delivery_mode,
      },
    };
  }

  const candidates = new Set();
  try {
    const base = new URL(source.base_url);
    const root = base.protocol + "//" + base.host;
    for (const suffix of ["/terms", "/terms-of-use", "/terms-conditions", "/copyright", "/licensing", "/licence", "/reuse", "/open-data", "/legal"]) {
      candidates.add(new URL(suffix, root).toString());
    }
  } catch {}

  const htmlLinks = String(endpointProbe.body || "").matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
  let linkBudget = 0;
  for (const m of htmlLinks) {
    const href = m[1];
    const label = href + " " + m[0];
    if (/(terms|copyright|licen[cs]|reuse|open[ -]?data|legal|conditions)/i.test(label)) {
      try {
        const absolute = new URL(href, endpointProbe.final_url || source.base_url).toString();
        if (samePublisherHost(source.base_url, absolute)) candidates.add(absolute);
      } catch {}
      linkBudget += 1;
      if (linkBudget >= 4) break;
    }
  }

  const urls = [...candidates].slice(0, 7);
  const results = await Promise.all(urls.map((url) => httpGet(url)));
  for (const result of results) {
    if (!result || !result.status || result.status < 200 || result.status >= 400) continue;
    const evidence = explicitRightsFromText(result.body);
    if (!evidence) continue;
    return {
      status: evidence.status === "COMMERCIAL_OK" ? "PASS" : "FAIL",
      strength: "VERIFIED",
      rights_status: evidence.status,
      method: "official-surface-rights-crawler",
      evidence_ref: result.final_url,
      evidence_hash: sha256(String(result.body || "").slice(0, 20000)),
      claim: evidence.reason,
      details: {
        policy_url: result.final_url,
        http_status: result.status,
        content_type: result.content_type,
        excerpt: evidence.excerpt,
      },
    };
  }

  if (String(source.commercial_usage_status || "") === "DERIVED_ONLY") {
    return {
      status: "UNKNOWN",
      strength: "ASSERTED",
      rights_status: "DERIVED_ONLY",
      method: "registry-assertion-only",
      evidence_ref: source.base_url,
      evidence_hash: sha256(JSON.stringify({
        source_id: source.source_id,
        commercial_usage_status: source.commercial_usage_status,
        licence_name: source.licence_name,
      })),
      claim: "Registry records DERIVED_ONLY, but no source-specific external rights evidence was found in this run.",
      details: {},
    };
  }

  return {
    status: "UNKNOWN",
    strength: "MISSING",
    rights_status: "REVIEW_REQUIRED",
    method: "official-surface-rights-crawler",
    evidence_ref: source.base_url,
    evidence_hash: sha256("missing-rights-evidence:" + source.source_id),
    claim: "No explicit commercial reuse/licensing evidence was found on the reviewed source surface.",
    details: {},
  };
}

function fallbackEvidence(source, queueRowsBySource, fallbackRowsByKey, sourcesById) {
  const pairs = {
    PRIMARY_MODULE: "FALLBACK_MODULE",
    FALLBACK_MODULE: "PRIMARY_MODULE",
    REGIONAL_PRIMARY: "REGIONAL_FALLBACK",
    REGIONAL_FALLBACK: "REGIONAL_PRIMARY",
    ROUTE_PRIMARY: "ROUTE_FALLBACK",
    ROUTE_FALLBACK: "ROUTE_PRIMARY",
    SHOCK_PRIMARY: "SHOCK_FALLBACK",
    SHOCK_FALLBACK: "SHOCK_PRIMARY",
  };
  const rows = queueRowsBySource.get(source.source_id) || [];
  if (
    rows.length > 0 &&
    rows.every((q) =>
      ["GOVERNMENT_PORTAL", "STATISTICS_OFFICE", "MONETARY_AUTHORITY"].includes(q.source_role)
    )
  ) {
    return {
      status: "PASS",
      strength: "OBSERVED",
      fallback_status: "NOT_REQUIRED",
      evidence_ref: "db://live_source_certification_queue/" + rows[0].queue_key,
      evidence_hash: sha256(JSON.stringify({ source_id: source.source_id, role: rows[0].source_role })),
      claim: "This direct institutional country source is a standalone corroboration path; the path role does not require a nested source-specific fallback.",
      details: { fallback_status: "NOT_REQUIRED", role: rows[0].source_role },
    };
  }
  for (const row of rows) {
    const role = pairs[row.source_role];
    if (!role) continue;
    const candidates = fallbackRowsByKey.get(governedScopeKey(row) + "|" + role) || [];
    const candidate = candidates.find((q) => q.source_id !== source.source_id);
    if (!candidate) continue;
    const other = sourcesById.get(candidate.source_id);
    if (other && String(other.provider_name || "") !== String(source.provider_name || "")) {
      return {
        status: "PASS",
        strength: "OBSERVED",
        fallback_status: "READY",
        evidence_ref: "db://live_source_certification_queue/" + candidate.queue_key,
        evidence_hash: sha256(JSON.stringify({
          source_id: source.source_id,
          queue_key: row.queue_key,
          fallback_queue_key: candidate.queue_key,
          fallback_source_id: candidate.source_id,
        })),
        claim: "A distinct-provider paired fallback path is present for at least one governed scope.",
        details: { fallback_source_id: candidate.source_id, fallback_queue_key: candidate.queue_key },
      };
    }
  }
  return {
    status: "FAIL",
    strength: "OBSERVED",
    fallback_status: "FAIL",
    evidence_ref: "db://live_source_certification_queue",
    evidence_hash: sha256("missing-fallback:" + source.source_id),
    claim: "No distinct-provider fallback pairing was proven for the source's queued paths.",
    details: {},
  };
}

async function loadAdapterEvidence(sourceIds) {
  const roots = ["src", "scripts", "supabase/functions", "supabase/isolated-signal/functions"];
  const textFiles = [];
  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "migrations") continue;
        if (entry.isDirectory()) await walk(full);
        else if (/\.(js|mjs|cjs|ts|tsx|sql)$/.test(entry.name)) textFiles.push(full);
      }
    } catch {}
  }
  for (const root of roots) await walk(root);

  const mapped = new Set();
  const tested = new Set();
  for (const file of textFiles) {
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    const isTest = /(__tests__|\.test\.|\.spec\.)/.test(file);
    for (const id of sourceIds) {
      if (content.includes(id)) {
        if (isTest) tested.add(id);
        else mapped.add(id);
      }
    }
  }
  return { mapped, tested };
}

async function main() {
  const [sources, queueRows, runtimeRows] = await Promise.all([
    fetchAll("live_external_sources", "*"),
    fetchAll("live_source_certification_queue", "*"),
    fetchAll("live_source_runtime_evidence_snapshot", "*"),
  ]);

  const sourcesById = new Map(sources.map(s => [s.source_id, s]));
  const runtimeById = new Map(runtimeRows.map(r => [r.source_id, r]));
  const queueRowsBySource = new Map();
  const providersByScopeKey = new Map();
  const fallbackRowsByKey = new Map();
  for (const row of queueRows) {
    if (!queueRowsBySource.has(row.source_id)) queueRowsBySource.set(row.source_id, []);
    queueRowsBySource.get(row.source_id).push(row);
    const scopeKey = governedScopeKey(row);
    if (!providersByScopeKey.has(scopeKey)) providersByScopeKey.set(scopeKey, new Set());
    const source = sourcesById.get(row.source_id);
    if (source) providersByScopeKey.get(scopeKey).add(String(source.provider_name || row.source_id));
    const fallbackKey = scopeKey + "|" + String(row.source_role || "");
    if (!fallbackRowsByKey.has(fallbackKey)) fallbackRowsByKey.set(fallbackKey, []);
    fallbackRowsByKey.get(fallbackKey).push(row);
  }
  const adapterEvidence = await loadAdapterEvidence(sources.map(s => s.source_id));

  const runId = "source-evidence-" + new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + CODE_REVISION.slice(0, 12);
  const evaluatedAt = new Date().toISOString();

  await supabase.from("live_source_certification_evidence_runs").insert({
    run_id: runId,
    code_revision: CODE_REVISION,
    evaluated_at: evaluatedAt,
    source_count: sources.length,
    write_operations_performed: true,
  }).throwOnError();

  const records = [];
  const nodes = [];
  const edges = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= sources.length) return;
      const source = sources[index];
      const sourceCanonical = canonicalObject({
        source_id: source.source_id,
        source_name: source.source_name,
        provider_name: source.provider_name,
        category: source.category,
        access_type: source.access_type,
        base_url: source.base_url,
        licence_name: source.licence_name,
        commercial_usage_status: source.commercial_usage_status,
        country_scope: source.country_scope,
        freshness_class: source.freshness_class,
      });
      const registryNodeId = sha256(runId + ":REGISTRY:" + source.source_id);
      nodes.push({
        evidence_id: registryNodeId,
        run_id: runId,
        source_id: source.source_id,
        dimension: "REGISTRY",
        status: "PASS",
        evidence_strength: "OBSERVED",
        claim: "Source registry record exists in the authoritative production database.",
        evidence_ref: "db://live_external_sources/" + source.source_id,
        evidence_hash: sha256(sourceCanonical),
        observed_at: evaluatedAt,
        method: "authoritative-production-registry-read",
        details: { source_name: source.source_name, provider_name: source.provider_name, category: source.category, base_url: source.base_url },
      });

      const endpoint = source.base_url
        ? await httpProbe(source.base_url)
        : { requested_url: null, final_url: null, status: null, content_type: null, content_length: null, last_modified: null, etag: null, cache_control: null, age: null, method: null, body: "", latency_ms: null, ok_transport: false, error: "SOURCE_BASE_URL_MISSING" };

      nodes.push({
        evidence_id: sha256(runId + ":ENDPOINT:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "ENDPOINT",
        status: endpoint.ok_transport ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: endpoint.ok_transport
          ? "The registered endpoint returned a transport-success response during this evidence run."
          : "Endpoint transport did not pass: " + String(endpoint.error || "HTTP " + endpoint.status),
        evidence_ref: endpoint.final_url || endpoint.requested_url || source.base_url,
        evidence_hash: sha256(JSON.stringify({
          requested_url: endpoint.requested_url,
          status: endpoint.status,
          final_url: endpoint.final_url,
          content_type: endpoint.content_type,
          last_modified: endpoint.last_modified,
          etag: endpoint.etag,
          body_sha256: sha256(endpoint.body),
        })),
        observed_at: evaluatedAt,
        method: "live-http-probe",
        details: {
          endpoint_url: endpoint.requested_url,
          final_url: endpoint.final_url,
          endpoint_status: endpoint.ok_transport ? "PASS" : "FAIL",
          http_status: endpoint.status,
          method: endpoint.method,
          content_type: endpoint.content_type,
          content_length: endpoint.content_length,
          last_modified: endpoint.last_modified,
          etag: endpoint.etag,
          latency_ms: endpoint.latency_ms,
          error: endpoint.error || null,
        },
      });

      const rights = await discoverRights(source, endpoint);
      nodes.push({
        evidence_id: sha256(runId + ":RIGHTS:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "RIGHTS",
        status: rights.status,
        evidence_strength: rights.strength,
        claim: rights.claim,
        evidence_ref: rights.evidence_ref,
        evidence_hash: rights.evidence_hash,
        observed_at: evaluatedAt,
        method: rights.method,
        details: Object.assign({ rights_status: rights.rights_status }, rights.details || {}),
      });

      const schema = schemaEvidence(endpoint, source);
      nodes.push({
        evidence_id: sha256(runId + ":SCHEMA:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "SCHEMA",
        status: schema.status,
        evidence_strength: schema.strength,
        claim: schema.claim,
        evidence_ref: endpoint.final_url || source.base_url,
        evidence_hash: sha256(JSON.stringify({
          source_id: source.source_id,
          status: schema.schema_status,
          content_type: endpoint.content_type,
          body_sha256: sha256(endpoint.body),
        })),
        observed_at: evaluatedAt,
        method: "live-response-schema-observation",
        details: Object.assign({ schema_status: schema.schema_status }, schema.details || {}),
      });

      let freshnessReference = latestTimestampFromText(endpoint.body);
      if (!freshnessReference) freshnessReference = timestampToIso(endpoint.last_modified);
      const parsedTimestamp = freshnessReference ? Date.parse(freshnessReference) : NaN;
      const lag = Number.isFinite(parsedTimestamp)
        ? Math.max(0, Math.floor((Date.now() - parsedTimestamp) / 1000))
        : null;
      const maxSeconds = freshnessThreshold(source);
      const fresh = lag !== null && lag <= maxSeconds && parsedTimestamp <= Date.now();
      nodes.push({
        evidence_id: sha256(runId + ":FRESHNESS:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "FRESHNESS",
        status: fresh ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: lag !== null
          ? "Observed source timestamp lag is " + lag + "s against a " + maxSeconds + "s source-class threshold."
          : "No trustworthy current timestamp was observed in the endpoint response or Last-Modified header.",
        evidence_ref: endpoint.final_url || source.base_url,
        evidence_hash: sha256(JSON.stringify({ source_id: source.source_id, freshnessReference, lag, maxSeconds, body_sha256: sha256(endpoint.body) })),
        observed_at: evaluatedAt,
        method: "live-response-freshness-observation",
        details: {
          freshness_status: fresh ? "FRESH" : "STALE",
          freshness_last_observed_at: freshnessReference,
          freshness_lag_seconds: lag,
          freshness_max_seconds: maxSeconds,
        },
      });

      const provenancePass = endpoint.ok_transport && samePublisherHost(source.base_url, endpoint.final_url || source.base_url);
      nodes.push({
        evidence_id: sha256(runId + ":PROVENANCE:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "PROVENANCE",
        status: provenancePass ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: provenancePass
          ? "Observed final endpoint host is publisher-consistent with the registered source host."
          : "Endpoint final host did not provide sufficient publisher-domain continuity for provenance certification.",
        evidence_ref: endpoint.final_url || source.base_url,
        evidence_hash: sha256(JSON.stringify({ base_url: source.base_url, final_url: endpoint.final_url, publisher_host_consistent: provenancePass })),
        observed_at: evaluatedAt,
        method: "publisher-domain-continuity-check",
        details: { provenance_status: provenancePass ? "PASS" : "FAIL" },
      });

      const sourceQueues = queueRowsBySource.get(source.source_id) || [];
      const providerSet = new Set([String(source.provider_name || source.source_id)]);
      for (const row of sourceQueues) {
        const peers = providersByScopeKey.get(governedScopeKey(row));
        if (!peers) continue;
        for (const provider of peers) providerSet.add(String(provider));
      }
      const independentCount = providerSet.size;
      nodes.push({
        evidence_id: sha256(runId + ":INDEPENDENCE:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "INDEPENDENCE",
        status: independentCount >= 2 ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: String(independentCount) + " distinct providers are observable across the source's governed scope peers.",
        evidence_ref: "db://live_source_certification_queue",
        evidence_hash: sha256(JSON.stringify({ source_id: source.source_id, providers: [source.provider_name].concat([...peerProviders]).sort() })),
        observed_at: evaluatedAt,
        method: "governed-scope-provider-diversity-check",
        details: {
          independence_status: independentCount >= 2 ? "PASS" : "FAIL",
          independence_group: String(source.provider_name),
          independent_source_count: independentCount,
        },
      });

      const tested = adapterEvidence.tested.has(source.source_id);
      const mapped = adapterEvidence.mapped.has(source.source_id);
      const adapterStatus = tested ? "TESTED" : mapped ? "MAPPED" : "UNMAPPED";
      nodes.push({
        evidence_id: sha256(runId + ":ADAPTER:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "ADAPTER",
        status: tested ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: tested
          ? "A source-specific adapter reference and test reference were found in the repository."
          : mapped
            ? "A source-specific repository reference was found, but no source-specific test reference was found."
            : "No source-specific production adapter/test reference was found in the scanned adapter roots.",
        evidence_ref: mapped
          ? "git://source-id/" + source.source_id
          : "git://repository-adapter-scan",
        evidence_hash: sha256(JSON.stringify({ source_id: source.source_id, mapped, tested })),
        observed_at: evaluatedAt,
        method: "repository-source-adapter-scan",
        details: { adapter_status: adapterStatus, adapter_id: tested || mapped ? source.source_id : null },
      });

      const runtime = runtimeById.get(source.source_id);
      const latestRuntimeAt = runtime?.latest_observed_at ? Date.parse(runtime.latest_observed_at) : NaN;
      const runtimeLag = Number.isFinite(latestRuntimeAt)
        ? Math.max(0, Math.floor((Date.now() - latestRuntimeAt) / 1000))
        : null;
      const runtimePass = Boolean(
        runtime &&
        Number(runtime.observation_count || 0) > 0 &&
        runtimeLag !== null &&
        runtimeLag <= maxSeconds &&
        Number(runtime.observations_with_source_url || 0) > 0,
      );
      nodes.push({
        evidence_id: sha256(runId + ":RUNTIME:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "RUNTIME",
        status: runtimePass ? "PASS" : "FAIL",
        evidence_strength: "OBSERVED",
        claim: runtimePass
          ? "A recent normalized observation exists with source URL provenance within the source-class freshness window."
          : "No recent runtime-normalized observation with source URL provenance satisfied the source-class freshness window.",
        evidence_ref: "db://live_source_runtime_evidence_snapshot",
        evidence_hash: sha256(JSON.stringify(runtime || { source_id: source.source_id })),
        observed_at: evaluatedAt,
        method: "normalized-observation-runtime-snapshot",
        details: {
          runtime_status: runtimePass ? "PASS" : "FAIL",
          observation_count: Number(runtime?.observation_count || 0),
          latest_observed_at: runtime?.latest_observed_at || null,
          runtime_lag_seconds: runtimeLag,
        },
      });

      const fallback = fallbackEvidence(source, queueRowsBySource, fallbackRowsByKey, sourcesById);
      nodes.push({
        evidence_id: sha256(runId + ":FALLBACK:" + source.source_id),
        run_id: runId,
        source_id: source.source_id,
        dimension: "FALLBACK",
        status: fallback.status,
        evidence_strength: fallback.strength,
        claim: fallback.claim,
        evidence_ref: fallback.evidence_ref,
        evidence_hash: fallback.evidence_hash,
        observed_at: evaluatedAt,
        method: "governed-fallback-pair-check",
        details: Object.assign({ fallback_status: fallback.fallback_status }, fallback.details || {}),
      });

      for (const dimension of ["ENDPOINT","RIGHTS","SCHEMA","FRESHNESS","PROVENANCE","INDEPENDENCE","ADAPTER","RUNTIME","FALLBACK"]) {
        edges.push({
          edge_id: sha256(runId + ":edge:" + source.source_id + ":REGISTRY:" + dimension),
          run_id: runId,
          from_evidence_id: registryNodeId,
          to_evidence_id: sha256(runId + ":" + dimension + ":" + source.source_id),
          relation: "SUPPORTS",
          observed_at: evaluatedAt,
        });
      }

      const dimNames = ["REGISTRY","ENDPOINT","RIGHTS","SCHEMA","FRESHNESS","PROVENANCE","INDEPENDENCE","ADAPTER","RUNTIME","FALLBACK"];
      const dimNodes = {};
      for (const dim of dimNames) {
        const id = sha256(runId + ":" + dim + ":" + source.source_id);
        dimNodes[dim] = id;
      }
      records[index] = {
        source_id: source.source_id,
        source_name: source.source_name,
        provider_name: source.provider_name,
        dimensions: Object.fromEntries(dimNames.map(dim => {
          const n = nodes.find(x => x.evidence_id === dimNodes[dim]);
          return [dim, {
            status: n?.status,
            strength: n?.evidence_strength,
            claim: n?.claim,
            evidence_ref: n?.evidence_ref,
          }];
        })),
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, worker));

  nodes.sort((a,b) => a.evidence_id.localeCompare(b.evidence_id));
  edges.sort((a,b) => a.edge_id.localeCompare(b.edge_id));

  for (let i = 0; i < nodes.length; i += 500) {
    await supabase.from("live_source_certification_evidence_nodes")
      .upsert(nodes.slice(i, i + 500), { onConflict: "evidence_id", ignoreDuplicates: false })
      .throwOnError();
  }
  for (let i = 0; i < edges.length; i += 500) {
    await supabase.from("live_source_certification_evidence_edges")
      .upsert(edges.slice(i, i + 500), { onConflict: "edge_id", ignoreDuplicates: false })
      .throwOnError();
  }

  const eligible = records.filter(record =>
    Object.values(record.dimensions).every(dim =>
      dim.status === "PASS" &&
      (dim.strength === "VERIFIED" || dim.strength === "OBSERVED")
    )
  );

  const promoted = [];
  const blocked = [];
  const promotedPaths = [];

  for (const record of records) {
    if (!eligible.some(x => x.source_id === record.source_id)) {
      blocked.push(record);
      continue;
    }
    const result = await supabase.rpc("promote_source_certification_from_evidence_graph", {
      p_source_id: record.source_id,
      p_run_id: runId,
      p_certified_by: ACTOR,
    });
    if (result.error) {
      blocked.push(Object.assign({}, record, { promotion_error: result.error.message }));
      continue;
    }
    promoted.push(result.data);

    const sourceCertHash = result.data.certification_hash;
    for (const q of queueRows.filter(row => row.source_id === record.source_id)) {
      const pathHash = sha256(sourceCertHash + ":" + q.queue_key + ":" + runId);
      const pathResult = await supabase.rpc("certify_live_source_queue_path", {
        p_queue_key: q.queue_key,
        p_endpoint_check: "PASS",
        p_rights_check: result.data.rights_status,
        p_schema_check: "PASS",
        p_freshness_check: "PASS",
        p_independence_check: "PASS",
        p_evidence_ref: "evidence-graph:" + runId + ":" + record.source_id + ":" + q.queue_key,
        p_certification_hash: pathHash,
        p_certified_by: ACTOR,
      });
      if (pathResult.error) {
        blocked.push({
          source_id: record.source_id,
          queue_key: q.queue_key,
          path_promotion_error: pathResult.error.message,
        });
      } else {
        promotedPaths.push(pathResult.data);
      }
    }
  }

  const blockedByReason = {};
  for (const item of blocked) {
    const reason = item.promotion_error || item.path_promotion_error || "evidence-dimensions-incomplete";
    blockedByReason[reason] = (blockedByReason[reason] || 0) + 1;
  }

  await supabase.from("live_source_certification_evidence_runs").update({
    node_count: nodes.length,
    edge_count: edges.length,
    source_eligible_count: eligible.length,
    source_promoted_count: promoted.length,
    path_promoted_count: promotedPaths.length,
    blocked_source_count: blocked.length,
    write_operations_performed: true,
  }).eq("run_id", runId).throwOnError();

  const summary = {
    schema_version: "geomacro-source-certification-evidence-graph-1.0",
    evaluated_at: evaluatedAt,
    authoritative_project_ref: PROJECT,
    code_revision: CODE_REVISION,
    actor: ACTOR,
    run_id: runId,
    source_count: sources.length,
    node_count: nodes.length,
    edge_count: edges.length,
    source_eligible_count: eligible.length,
    source_promoted_count: promoted.length,
    path_promoted_count: promotedPaths.length,
    blocked_source_count: blocked.length,
    blocked_by_reason: blockedByReason,
    write_operations_performed: true,
    promotion_rule: "Every one of REGISTRY, ENDPOINT, RIGHTS, SCHEMA, FRESHNESS, PROVENANCE, INDEPENDENCE, ADAPTER, RUNTIME and FALLBACK must be PASS with VERIFIED/OBSERVED evidence; rights must resolve to COMMERCIAL_OK or DERIVED_ONLY.",
    limitations: [
      "A complete evidence graph is not equivalent to 100% certification.",
      "Registry rights assertions without external evidence stay blocked.",
      "HTML endpoints without a tested source-specific machine adapter stay blocked.",
      "No source is enabled or commercially opened by this job; certification promotion only changes the evidence-backed certification state/path attestation.",
    ],
  };

  await fs.writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "sources.json"), JSON.stringify(records, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "nodes.json"), JSON.stringify(nodes, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "edges.json"), JSON.stringify(edges, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "blocked.json"), JSON.stringify(blocked, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "promoted.json"), JSON.stringify(promoted, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "promoted-paths.json"), JSON.stringify(promotedPaths, null, 2) + "\n");

  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes("--strict") && blocked.length > 0) process.exit(1);
}

await main();

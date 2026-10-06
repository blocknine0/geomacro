#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.GEOMACRO_LOCAL_FLASH_INGEST_PORT ?? "8788");
const TOKEN = String(process.env.GEOMACRO_LOCAL_FLASH_INGEST_TOKEN ?? "").trim();

if (!TOKEN) throw new Error("GEOMACRO_LOCAL_FLASH_INGEST_TOKEN is required");
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("Local flash ingest requires GRI_DB_MODE=direct_postgres");
}

const db = createGriDbClient();

const SIGNAL_CATEGORIES = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
const ALLOWED_VERIFICATION_STATUSES = new Set([
  "UNVERIFIED",
  "CORROBORATING",
  "VERIFIED",
  "REJECTED",
]);
const CATEGORY_KEYWORDS = {
  GEOPOLITICS: [
    "war","attack","strike","missile","military","troops","border","invasion",
    "ceasefire","airstrike","drone","coup","protest","sanctions","tariff",
    "diplomatic","embassy","hostage","terror","conflict","navy","weapon",
    "nuclear","security",
  ],
  MACRO: [
    "fed","fomc","interest rate","rates","inflation","cpi","ppi","gdp","jobs",
    "payrolls","unemployment","employment","central bank","ecb","boj","boe",
    "pmi","retail sales","yield","bond","treasury","currency","forex","fx",
    "recession","default","debt","fiscal","monetary","capital flows","trade balance",
  ],
  CRITICAL_MINERALS: [
    "critical mineral","critical minerals","rare earth","lithium","cobalt","nickel",
    "graphite","manganese","copper","gallium","germanium","tungsten","vanadium",
    "chromium","antimony","beryllium","niobium","tantalum","tin","uranium",
    "mineral mine","mineral supply","ore concentrate","refinery","refining capacity",
    "mineral export",
  ],
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function clampScore(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSignalCategory(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SIGNAL_CATEGORIES.has(normalized) ? normalized : "UNCLASSIFIED";
}

function categoryFromEventType(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized.startsWith("GEOPOLITICS")) return "GEOPOLITICS";
  if (normalized.startsWith("MACRO")) return "MACRO";
  if (normalized.startsWith("CRITICAL_MINERALS")) return "CRITICAL_MINERALS";
  return "UNCLASSIFIED";
}

function classifySignalCategory(payload, headline, body) {
  const explicit = normalizeSignalCategory(payload.signal_category);
  if (explicit !== "UNCLASSIFIED") return explicit;
  const fromType = categoryFromEventType(payload.event_type);
  if (fromType !== "UNCLASSIFIED") return fromType;

  const text = normalizeText(`${headline} ${body ?? ""}`).slice(0, 18000);
  const scores = Object.entries(CATEGORY_KEYWORDS)
    .map(([category, words]) => ({
      category,
      score: words.reduce((n, word) => n + Number(text.includes(normalizeText(word))), 0),
    }))
    .sort((a, b) => b.score - a.score);

  const [top, second] = scores;
  return top && top.score >= 2 && top.score >= (second?.score ?? 0) + 1
    ? top.category
    : "UNCLASSIFIED";
}

function headlineTokens(value) {
  return normalizeText(value).split(" ").filter((token) => token.length >= 3);
}

function headlineSimilarity(left, right) {
  const a = new Set(headlineTokens(left));
  const b = new Set(headlineTokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function numberSignature(value) {
  return Array.from(normalizeText(value).matchAll(/\b\d+(?:\.\d+)?(?:%|bps)?\b/g))
    .map((match) => match[0])
    .sort()
    .join("|");
}

function materialEditChange(previousHeadline, nextHeadline) {
  if (numberSignature(previousHeadline) !== numberSignature(nextHeadline)) {
    return { material: true, reason: "numeric_fact_changed" };
  }
  if (headlineSimilarity(previousHeadline, nextHeadline) < 0.92) {
    return { material: true, reason: "headline_materially_changed" };
  }
  return { material: false, reason: "minor_or_formatting_edit" };
}

let countryRows = null;
async function loadCountries() {
  if (countryRows) return countryRows;
  const result = await db
    .from("live_country_registry")
    .select("iso2,iso3,country_name,aliases,demonyms")
    .eq("enabled", true);
  if (result.error) throw new Error(`country registry read failed: ${result.error.message}`);
  countryRows = result.data ?? [];
  return countryRows;
}

function explicitIsoMatches(payload, rows) {
  const allowed = new Set(rows.map((row) => row.iso3));
  const values = [
    payload.country_iso3,
    ...(Array.isArray(payload.related_country_iso3) ? payload.related_country_iso3 : []),
  ];
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const iso3 = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3) || !allowed.has(iso3) || seen.has(iso3)) continue;
    seen.add(iso3);
    output.push({ iso3, confidence: 95, method: "SUPPLIED_ISO3_VALIDATED", matched: iso3, rank: 100000 });
  }
  return output;
}

function inferCountries(rawText, rows) {
  const text = ` ${normalizeText(rawText)} `;
  const candidates = [];
  const withoutUsOpen = rawText.replace(/(?:US|U\.S\.)\s+Open\b/g, "");
  const allowed = new Set(rows.map((row) => row.iso3));

  if (allowed.has("USA") && /(?:^|[^A-Za-z0-9])(?:US|U\.S\.)(?=$|[^A-Za-z0-9])/.test(withoutUsOpen)) {
    candidates.push({ iso3: "USA", confidence: 90, method: "UPPERCASE_COUNTRY_ABBREVIATION", matched: "US/U.S.", rank: 900 });
  }
  if (allowed.has("GBR") && /(?:^|[^A-Za-z0-9])(?:UK|U\.K\.)(?=$|[^A-Za-z0-9])/.test(rawText)) {
    candidates.push({ iso3: "GBR", confidence: 90, method: "UPPERCASE_COUNTRY_ABBREVIATION", matched: "UK/U.K.", rank: 900 });
  }

  for (const row of rows) {
    for (const value of [row.country_name, ...(row.aliases ?? []), ...(row.demonyms ?? [])]) {
      if (typeof value !== "string") continue;
      const normalized = normalizeText(value);
      if (normalized.length < 3 || !text.includes(` ${normalized} `)) continue;
      const rank = normalized.split(" ").length * 1000 + normalized.length;
      candidates.push({
        iso3: row.iso3,
        confidence: normalized === normalizeText(row.country_name) ? 88 : 78,
        method: "COUNTRY_REGISTRY_TEXT_MATCH",
        matched: value,
        rank,
      });
    }
  }

  candidates.sort((a, b) => b.rank - a.rank);
  const seen = new Set();
  return candidates.filter((item) => {
    if (seen.has(item.iso3)) return false;
    seen.add(item.iso3);
    return true;
  }).slice(0, 8);
}

async function ingest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid_json");
  }

  const sourceId = cleanString(payload.source_id, 120) ?? "telegram_mtproto_flash";
  if (sourceId === "telegram_mtproto_flash") {
    throw new Error("direct_postgres_rss_mode_does_not_accept_telegram");
  }

  const source = await db
    .from("live_external_sources")
    .select("source_id,enabled_for_ingestion,commercial_usage_status,attribution_required")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (source.error) throw new Error(`source lookup failed: ${source.error.message}`);
  if (!source.data || source.data.enabled_for_ingestion !== true) throw new Error("source_not_allowed");

  const sourceRecordId = cleanString(payload.source_record_id, 500);
  const headline = cleanString(payload.headline, 1200);
  if (!sourceRecordId || !headline) throw new Error("source_record_id_and_headline_required");

  const body = cleanString(payload.body, 12000);
  const sourceChannel = cleanString(payload.source_channel, 300);
  const sourceUrl = cleanString(payload.source_url, 2000);
  const publishedAt = cleanString(payload.published_at, 80);
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) throw new Error("invalid_published_at");

  const signalCategory = classifySignalCategory(payload, headline, body);
  const requestedVerification = String(payload.verification_status ?? "UNVERIFIED");
  const verificationStatus = ALLOWED_VERIFICATION_STATUSES.has(requestedVerification)
    ? requestedVerification
    : "UNVERIFIED";

  const countries = await loadCountries();
  const explicit = explicitIsoMatches(payload, countries);
  const countryMatches = explicit.length
    ? explicit
    : inferCountries(`${headline}\n${body ?? ""}`, countries);

  const existing = await db
    .from("live_flash_events")
    .select("flash_id,content_hash,source_version,first_seen_at,last_material_update_at,event_family_id,headline")
    .eq("source_id", sourceId)
    .eq("source_record_id", sourceRecordId)
    .maybeSingle();
  if (existing.error) throw new Error(`existing flash lookup failed: ${existing.error.message}`);

  const stableIdentityHash = sha256(`${sourceId}:${sourceRecordId}`);
  const contentHash = sha256(JSON.stringify({
    source_id: sourceId,
    source_record_id: sourceRecordId,
    published_at: publishedAt,
    headline,
    body,
    source_channel: sourceChannel,
    source_channel_key: null,
    source_url: sourceUrl,
  }));
  const flashId = `${sourceId}_${stableIdentityHash.slice(0, 32)}`;
  const nowIso = new Date().toISOString();
  const previous = existing.data ?? null;

  if (previous && previous.content_hash === contentHash) {
    const versionCheck = await db
      .from("live_flash_event_versions")
      .select("id")
      .eq("flash_id", previous.flash_id)
      .eq("source_version", previous.source_version)
      .maybeSingle();
    if (versionCheck.error) throw new Error(`version lookup failed: ${versionCheck.error.message}`);
    if (!versionCheck.data) {
      const repaired = await db.from("live_flash_event_versions").insert({
        flash_id: previous.flash_id,
        event_family_id: previous.event_family_id,
        source_version: previous.source_version,
        captured_at: nowIso,
        published_at: publishedAt,
        headline,
        content_hash: contentHash,
        signal_category: signalCategory,
        material_update: false,
        material_update_reason: "idempotent_version_repair",
      });
      if (repaired.error) throw new Error(`version repair failed: ${repaired.error.message}`);
    }

    const attrs = await db
      .from("live_flash_event_countries")
      .select("country_iso3,is_primary,confidence,attribution_method")
      .eq("flash_id", previous.flash_id)
      .order("is_primary", { ascending: false })
      .order("country_iso3", { ascending: true });
    if (attrs.error) throw new Error(`country lookup failed: ${attrs.error.message}`);

    return {
      ok: true,
      duplicate: true,
      unchanged: true,
      flash_id: previous.flash_id,
      source_id: sourceId,
      signal_category: signalCategory,
      event_version: previous.source_version,
      material_update: false,
      verification_status: "UNCHANGED",
      countries: (attrs.data ?? []).map((row) => ({
        iso3: row.country_iso3,
        primary: Boolean(row.is_primary),
        confidence: row.confidence,
        method: row.attribution_method,
      })),
      scoring_eligible: false,
      transport: "direct_postgres",
    };
  }

  const sourceVersion = previous ? Number(previous.source_version ?? 1) + 1 : 1;
  const edit = previous
    ? materialEditChange(previous.headline, headline)
    : { material: false, reason: "initial_source_record" };
  const materialUpdate = Boolean(previous && edit.material);

  const eventRow = {
    flash_id: flashId,
    signal_category: signalCategory,
    source_version: sourceVersion,
    material_update: materialUpdate,
    material_update_reason: previous ? edit.reason : "initial_source_record",
    first_seen_at: previous?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
    last_material_update_at: materialUpdate ? nowIso : (previous?.last_material_update_at ?? null),
    event_family_id: previous?.event_family_id ?? null,
    source_id: sourceId,
    source_record_id: sourceRecordId,
    published_at: publishedAt,
    updated_at: nowIso,
    headline,
    body: null,
    source_channel: sourceChannel,
    source_url: sourceUrl,
    event_type: cleanString(payload.event_type, 200),
    severity: clampScore(payload.severity),
    source_reliability: clampScore(payload.source_reliability),
    verification_status: verificationStatus,
    latitude: null,
    longitude: null,
    commodity_tags: Array.isArray(payload.commodity_tags)
      ? payload.commodity_tags.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 30)
      : [],
    raw_payload: null,
    content_hash: contentHash,
    source_channel_key: null,
  };

  const stored = await db
    .from("live_flash_events")
    .upsert(eventRow, { onConflict: "source_id,source_record_id" })
    .select("flash_id")
    .single();
  if (stored.error || !stored.data) throw new Error(`flash store failed: ${stored.error?.message ?? "no row"}`);

  const reset = await db.from("live_flash_event_countries").delete().eq("flash_id", stored.data.flash_id);
  if (reset.error) throw new Error(`country reset failed: ${reset.error.message}`);

  if (countryMatches.length) {
    const inserted = await db.from("live_flash_event_countries").insert(
      countryMatches.map((match, index) => ({
        flash_id: stored.data.flash_id,
        country_iso3: match.iso3,
        is_primary: index === 0,
        confidence: match.confidence,
        attribution_method: match.method,
      })),
    );
    if (inserted.error) throw new Error(`country attribution failed: ${inserted.error.message}`);
  }

  const version = await db.from("live_flash_event_versions").insert({
    flash_id: stored.data.flash_id,
    event_family_id: previous?.event_family_id ?? null,
    source_version: sourceVersion,
    captured_at: nowIso,
    published_at: publishedAt,
    headline,
    content_hash: contentHash,
    signal_category: signalCategory,
    material_update: materialUpdate,
    material_update_reason: previous ? edit.reason : "initial_source_record",
  });
  if (version.error) throw new Error(`version store failed: ${version.error.message}`);

  return {
    ok: true,
    flash_id: stored.data.flash_id,
    signal_category: signalCategory,
    event_version: sourceVersion,
    material_update: materialUpdate,
    source_id: sourceId,
    verification_status: verificationStatus,
    countries: countryMatches.map((match, index) => ({
      iso3: match.iso3,
      primary: index === 0,
      confidence: match.confidence,
      method: match.method,
    })),
    scoring_eligible: false,
    transport: "direct_postgres",
  };
}

function authorized(request) {
  const raw = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const header = String(request.headers["x-geomacro-flash-token"] ?? "");
  const supplied = header || raw;
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(TOKEN);
  return left.length === right.length && timingSafeEqual(left, right);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, transport: "direct_postgres", bind: HOST }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/ingest") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    if (!authorized(request)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 64 * 1024) throw new Error("payload_too_large");
    }
    const result = await ingest(JSON.parse(raw));
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /source_not_allowed/.test(message) ? 403 : /required|invalid|payload_too_large/.test(message) ? 400 : 500;
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: false, error: message.slice(0, 1000) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({
    ok: true,
    kind: "local_flash_ingest_ready",
    host: HOST,
    port: PORT,
    transport: "direct_postgres",
    raw_payload_persisted: false,
  }));
});

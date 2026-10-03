#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  buildCountryRiskObject,
  type CountryRiskEventInput,
} from "../src/lib/country-risk-engine";
import {
  applyCountryRiskCommercialEligibility,
  type StructuredEventCommercialEligibility,
} from "../src/lib/country-risk-commercial-eligibility";
import { assertFedericoPublicationReady } from "../src/lib/federico-publication-policy";
import {
  FEDERICO_STRICT_CALCULATION_NAMESPACE,
  FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS,
  FEDERICO_STRICT_HIGH_IMPACT_SEVERITY,
  FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
  FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY,
  FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD,
  federicoStrictSourceFamilyForId,
} from "../src/lib/public-demo-risk-profile";
import {
  canonicalRiskObjectJson,
  signRiskObject,
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";
import { createB2Client } from "./ops/b2-s3-client.mjs";

const COUNTRY_ISO3 = "CHN";
const MAX_PEER_DELTA_SECONDS = 3600;
const USER_AGENT = "Geomacro-Day6-Assurance/1.0 (+https://geomacro.live; contact=contact@geomacro.live)";
const B2_BUCKET = "geomacro-private-archive";
const RISK_OBJECT_OUT = process.env.DAY6_RISK_OBJECT_OUT?.trim() || "/tmp/day6-risk-object.json";
const EVIDENCE_OUT = process.env.DAY6_DIRECT_EVIDENCE_OUT?.trim() || "/tmp/day6-direct-evidence.json";

const FEEDS = [
  { source_id: "aljazeera_rss", url: "https://www.aljazeera.com/xml/rss/all.xml", reliability: 70 },
  { source_id: "bbc_world_rss", url: "https://feeds.bbci.co.uk/news/world/rss.xml", reliability: 85 },
  { source_id: "xinhua_english_china_rss", url: "https://www.xinhuanet.com/english/rss/chinarss.xml", reliability: 90 },
  { source_id: "scmp_china_rss", url: "https://www.scmp.com/rss/4/feed", reliability: 80 },
  { source_id: "forexlive_rss", url: "https://www.forexlive.com/feed/news", reliability: 65 },
] as const;

const CHINA_TERMS = [
  "china", "chinese", "beijing", "shanghai", "prc", "hong kong", "taiwan",
] as const;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "to", "of", "in", "on", "at",
  "for", "from", "by", "with", "as", "is", "are", "was", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "says", "said", "say", "according", "after", "before",
  "over", "under", "into", "amid", "about", "around", "more", "new", "latest", "breaking", "update",
  "updates", "report", "reports", "reported", "live",
]);

type Article = {
  source_id: string;
  source_family: string;
  reliability: number;
  title: string;
  url: string;
  published_at: string;
  source_record_id: string;
  content_hash: string;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]s\b/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: unknown) {
  const output = new Set<string>();
  for (const raw of normalize(value).split(" ")) {
    const token = raw.replace(/^[^a-z0-9]+|[^a-z0-9.%$+-]+$/g, "");
    if (!token || STOPWORDS.has(token)) continue;
    if (token.length < 3 && !/^\d/.test(token)) continue;
    output.add(token);
  }
  return output;
}

function similarity(left: unknown, right: unknown) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(a.size, b.size);
  return Math.max(0, Math.min(1, 0.62 * jaccard + 0.38 * containment));
}

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function itemLink(block: string) {
  const text = tag(block, "link");
  if (/^https?:\/\//i.test(text)) return text;
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] ?? "";
  return /^https?:\/\//i.test(href) ? decodeXml(href) : "";
}

function parseFeed(xml: string, sourceId: string, reliability: number, now: Date): Article[] {
  const blocks = [
    ...[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]),
    ...[...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]),
  ];
  const output: Article[] = [];
  for (const block of blocks.slice(0, 100)) {
    const title = tag(block, "title");
    const url = itemLink(block);
    const dateRaw = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    const published = new Date(dateRaw);
    if (!title || !url || Number.isNaN(published.getTime())) continue;
    const ageHours = (now.getTime() - published.getTime()) / 3_600_000;
    if (ageHours < -10 / 60 || ageHours > FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS) continue;
    const normalizedTitle = normalize(title);
    if (!CHINA_TERMS.some((term) => normalizedTitle.includes(term))) continue;
    const publishedAt = published.toISOString();
    output.push({
      source_id: sourceId,
      source_family: federicoStrictSourceFamilyForId(sourceId),
      reliability,
      title,
      url,
      published_at: publishedAt,
      source_record_id: sha256(`${sourceId}|${url}|${publishedAt}`),
      content_hash: sha256(`${normalizedTitle}|${publishedAt}`),
    });
  }
  return output;
}

async function fetchText(url: string) {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.5", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const text = await response.text();
      if (text.length < 80) throw new Error("FEED_TOO_SMALL");
      return text;
    } catch (error) {
      last = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last ?? "FEED_FETCH_FAILED"));
}

function classify(text: string) {
  const value = normalize(text);
  if (/\b(conflict|military|attack|missile|invasion|war|strike)\b/.test(value)) {
    return { domain: "geopolitics" as const, event_type: "geopolitics_conflict", severity: 75 };
  }
  if (/\b(sanction|sanctions|export control|export controls|embargo)\b/.test(value)) {
    return { domain: "geopolitics" as const, event_type: "export_control_update", severity: 65 };
  }
  if (/\b(tariff|tariffs|trade|imports|exports)\b/.test(value)) {
    return { domain: "geopolitics" as const, event_type: "trade_policy_update", severity: 60 };
  }
  if (/\b(rare earth|critical mineral|critical minerals|lithium|cobalt|graphite)\b/.test(value)) {
    return { domain: "rare_earth" as const, event_type: "critical_mineral_update", severity: 60 };
  }
  if (/\b(pbo[c]?|yuan|renminbi|interest rate|rates|inflation|monetary)\b/.test(value)) {
    return { domain: "macro" as const, event_type: "monetary_policy_update", severity: 55 };
  }
  return { domain: "geopolitics" as const, event_type: "geopolitical_development", severity: 50 };
}

const now = new Date();
const diagnostics: Array<Record<string, unknown>> = [];
const articles: Article[] = [];

await Promise.all(FEEDS.map(async (feed) => {
  try {
    const xml = await fetchText(feed.url);
    const parsed = parseFeed(xml, feed.source_id, feed.reliability, now);
    articles.push(...parsed);
    diagnostics.push({ source_id: feed.source_id, fetch: "PASS", fresh_china_items: parsed.length });
  } catch (error) {
    diagnostics.push({
      source_id: feed.source_id,
      fetch: "FAIL",
      reason: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120),
    });
  }
}));

const candidates: Array<{ left: Article; right: Article; similarity: number; verification_score: number; delta_seconds: number }> = [];
for (let i = 0; i < articles.length; i++) {
  for (let j = i + 1; j < articles.length; j++) {
    const left = articles[i];
    const right = articles[j];
    if (left.source_family === right.source_family) continue;
    const deltaSeconds = Math.round(Math.abs(Date.parse(left.published_at) - Date.parse(right.published_at)) / 1000);
    if (!Number.isFinite(deltaSeconds) || deltaSeconds > MAX_PEER_DELTA_SECONDS) continue;
    const score = similarity(left.title, right.title);
    if (score < FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY) continue;
    const primaryReliability = Math.max(left.reliability, right.reliability);
    const verificationScore = Math.max(
      0,
      Math.min(100, Math.min(10, primaryReliability * 0.10) + 30 + score * 35 + 15),
    );
    if (verificationScore < FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD) continue;
    candidates.push({ left, right, similarity: score, verification_score: verificationScore, delta_seconds: deltaSeconds });
  }
}

candidates.sort((a, b) =>
  b.verification_score - a.verification_score ||
  b.similarity - a.similarity ||
  Math.max(Date.parse(b.left.published_at), Date.parse(b.right.published_at)) -
    Math.max(Date.parse(a.left.published_at), Date.parse(a.right.published_at)),
);

const selected = candidates[0];
if (!selected) {
  await writeFile(EVIDENCE_OUT, JSON.stringify({
    ok: false,
    schema: "geomacro.day6-direct-live-evidence.v1",
    evaluated_at: now.toISOString(),
    country_iso3: COUNTRY_ISO3,
    policy: {
      max_evidence_age_hours: FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
      max_peer_delta_seconds: MAX_PEER_DELTA_SECONDS,
      min_similarity: FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY,
      min_verification_score: FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD,
    },
    fresh_candidate_count: articles.length,
    matching_pair_count: 0,
    sources: diagnostics,
  }, null, 2) + "\n", { mode: 0o600 });
  throw new Error("DAY6_NO_FRESH_CORROBORATED_LIVE_PAIR");
}

const pair = [selected.left, selected.right].sort((a, b) => a.source_id.localeCompare(b.source_id));
const firstSeen = new Date(Math.min(...pair.map((item) => Date.parse(item.published_at)))).toISOString();
const materialEvidenceAt = new Date(Math.max(...pair.map((item) => Date.parse(item.published_at)))).toISOString();
const classification = classify(`${selected.left.title} ${selected.right.title}`);
const materialAgeHours = Math.max(0, (now.getTime() - Date.parse(materialEvidenceAt)) / 3_600_000);
if (
  classification.severity >= FEDERICO_STRICT_HIGH_IMPACT_SEVERITY &&
  /conflict|military|attack|escalat/i.test(classification.event_type) &&
  materialAgeHours > FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS
) {
  throw new Error("DAY6_HIGH_IMPACT_FRESHNESS_GATE_FAILED");
}

const eventId = `direct_live_${sha256(pair.map((item) => item.content_hash).join("|")).slice(0, 24)}`;
const event: CountryRiskEventInput = {
  id: eventId,
  domain: classification.domain,
  event_type: classification.event_type,
  title: "Corroborated CHN development across independent governed sources",
  primary_country: COUNTRY_ISO3,
  countries: [COUNTRY_ISO3],
  severity: classification.severity,
  confidence: Number(selected.verification_score.toFixed(3)),
  direction: "unknown",
  first_seen_at: firstSeen,
  last_seen_at: materialEvidenceAt,
  material_evidence_at: materialEvidenceAt,
  evidence_count: pair.length,
  independent_source_count: new Set(pair.map((item) => item.source_family)).size,
  evidence_refs: pair.map((item) => item.content_hash),
  structure_version: "direct-governed-rss-family-v1",
  structured_payload: {
    scoring_version: "direct-rss-severity-v1",
    relevance_version: "country-lexical-nexus-v1",
    country_version: "iso3-direct-china-nexus-v1",
    story_version: "token-similarity-time-country-v1",
    source_families: pair.map((item) => item.source_family),
    source_ids: pair.map((item) => item.source_id),
    source_record_ids: pair.map((item) => item.source_record_id),
    content_hashes: pair.map((item) => item.content_hash),
    similarity: Number(selected.similarity.toFixed(5)),
    peer_time_delta_seconds: selected.delta_seconds,
    verification_score: Number(selected.verification_score.toFixed(3)),
    raw_payload_included: false,
  },
  event_family_id: `direct-family:${sha256(pair.map((item) => item.content_hash).join("|")).slice(0, 24)}`,
  source_ids: pair.map((item) => item.source_id),
  source_record_ids: pair.map((item) => item.source_record_id),
  source_urls: pair.map((item) => item.url),
  source_families: pair.map((item) => item.source_family),
  content_hashes: pair.map((item) => item.content_hash),
  relevance_reason: "Both independent governed source headlines contain a direct CHN nexus and meet the canonical similarity/time policy.",
  transmission_channel: "direct_country_link",
  relevance_weight: 1,
  subject_is_primary: true,
  subject_attribution_confidence: 100,
  subject_attribution_method: "direct_china_nexus_two_source_corroboration_v1",
  corroboration_status: "CONFIRMED",
};

const commercialEligibility: StructuredEventCommercialEligibility[] = [{
  event_id: eventId,
  status: "DERIVED_ONLY",
  reason_codes: [
    "verified_live_flash_family",
    "derived_only_delivery_no_raw_redistribution",
    "direct_governed_source_metadata_only",
  ],
}];

const built = await buildCountryRiskObject({
  country_iso3: COUNTRY_ISO3,
  as_of: now.toISOString(),
  calculation_namespace: FEDERICO_STRICT_CALCULATION_NAMESPACE,
  events: [event],
});
const eligible = applyCountryRiskCommercialEligibility(built, commercialEligibility);
assertFedericoPublicationReady(eligible);
const signed = signRiskObject(eligible);
const localVerification = verifyRiskObjectSignature(signed);
if (!localVerification.valid) throw new Error(`DAY6_LOCAL_SIGNATURE_FAILED:${localVerification.reason}`);

const raw = Buffer.from(JSON.stringify(signed));
const compressed = gzipSync(raw, { level: 9 });
const archiveKey = `geomacro-evidence/v1/partner-assurance/federico/${signed.object_id}.json.gz`;
const proofKey = `geomacro-evidence/v1/partner-assurance/federico/${signed.object_id}.proof.json`;
const b2 = createB2Client({
  endpointUrl: requireEnv("B2_S3_ENDPOINT"),
  accessKey: requireEnv("B2_KEY_ID"),
  secretKey: requireEnv("B2_APPLICATION_KEY"),
  bucket: B2_BUCKET,
});
await b2.put(archiveKey, compressed);
const readback = await b2.get(archiveKey);
if (sha256(readback) !== sha256(compressed)) throw new Error("DAY6_B2_READBACK_HASH_MISMATCH");
const restored = JSON.parse(gunzipSync(readback).toString("utf8"));
if (canonicalRiskObjectJson(restored) !== canonicalRiskObjectJson(signed)) {
  throw new Error("DAY6_B2_CANONICAL_READBACK_MISMATCH");
}
if (!verifyRiskObjectSignature(restored).valid) throw new Error("DAY6_B2_SIGNATURE_READBACK_FAILED");

const proof = {
  schema: "geomacro.day6-partner-gro-b2-proof.v1",
  object_id: signed.object_id,
  archive_key: archiveKey,
  payload_hash: signed.integrity.payload_hash,
  signing_key_id: signed.integrity.signing_key_id,
  canonical_record_sha256: sha256(canonicalRiskObjectJson(signed)),
  compressed_sha256: sha256(compressed),
  generated_at: signed.generated_at,
  expires_at: signed.expires_at,
  verified_at: new Date().toISOString(),
  b2_readback_verified: true,
  raw_source_payload_stored: false,
  source_ids: pair.map((item) => item.source_id),
  source_families: pair.map((item) => item.source_family),
  source_content_hashes: pair.map((item) => item.content_hash),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

await writeFile(RISK_OBJECT_OUT, JSON.stringify(signed, null, 2) + "\n", { mode: 0o600 });
await writeFile(EVIDENCE_OUT, JSON.stringify({
  ok: true,
  schema: "geomacro.day6-direct-live-evidence.v1",
  evaluated_at: now.toISOString(),
  country_iso3: COUNTRY_ISO3,
  source_ids: pair.map((item) => item.source_id),
  source_families: pair.map((item) => item.source_family),
  source_record_ids: pair.map((item) => item.source_record_id),
  content_hashes: pair.map((item) => item.content_hash),
  published_at: pair.map((item) => item.published_at),
  similarity: Number(selected.similarity.toFixed(5)),
  peer_time_delta_seconds: selected.delta_seconds,
  verification_score: Number(selected.verification_score.toFixed(3)),
  commercial_delivery: "DERIVED_ONLY",
  raw_payload_included: false,
  object_id: signed.object_id,
  b2_archive_key: archiveKey,
  b2_proof_key: proofKey,
  b2_readback_verified: true,
  sources: diagnostics,
}, null, 2) + "\n", { mode: 0o600 });

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.day6-direct-live-gro-result.v1",
  object_id: signed.object_id,
  schema_version: signed.schema_version,
  decision_readiness: signed.decision_readiness,
  commercial_eligibility: signed.commercial_eligibility,
  verification: signed.verification,
  integrity: {
    signing_key_id: signed.integrity.signing_key_id,
    signature_present: Boolean(signed.integrity.signature),
    signature_valid: true,
    payload_hash: signed.integrity.payload_hash,
  },
  evidence: {
    independent_source_count: signed.evidence_summary.independent_source_count,
    similarity: Number(selected.similarity.toFixed(5)),
    peer_time_delta_seconds: selected.delta_seconds,
    verification_score: Number(selected.verification_score.toFixed(3)),
    source_ids: pair.map((item) => item.source_id),
  },
  persistence: {
    authority: "b2",
    archive_key: archiveKey,
    readback_verified: true,
  },
  execution_authorized: false,
}, null, 2));

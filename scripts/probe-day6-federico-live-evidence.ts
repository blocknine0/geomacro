#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
  FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY,
  FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD,
  federicoStrictSourceFamilyForId,
} from "../src/lib/public-demo-risk-profile";

const MAX_PEER_DELTA_SECONDS = 3600;
const USER_AGENT =
  "Geomacro-Day6-Evidence-Probe/1.0 (+https://geomacro.live; contact=contact@geomacro.live)";

const FEEDS = [
  { source_id: "aljazeera_rss", url: "https://www.aljazeera.com/xml/rss/all.xml", reliability: 70 },
  { source_id: "bbc_world_rss", url: "https://feeds.bbci.co.uk/news/world/rss.xml", reliability: 85 },
  { source_id: "xinhua_english_china_rss", url: "https://www.xinhuanet.com/english/rss/chinarss.xml", reliability: 90 },
  { source_id: "scmp_china_rss", url: "https://www.scmp.com/rss/4/feed", reliability: 80 },
  { source_id: "forexlive_rss", url: "https://www.forexlive.com/feed/news", reliability: 65 },
] as const;

const CHINA_TERMS = [
  "china",
  "chinese",
  "beijing",
  "shanghai",
  "prc",
  "hong kong",
  "taiwan",
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
  published_at: string;
  content_hash: string;
};

function sha256(value: string) {
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
  const stripped = value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .replace(/<[^>]+>/g, " ");

  return stripped
    .replace(/&(amp|quot|apos|lt|gt|#39|#\d+);/gi, (entity, token: string) => {
      const normalizedToken = token.toLowerCase();
      if (normalizedToken === "amp") return "&";
      if (normalizedToken === "quot") return '"';
      if (normalizedToken === "apos" || normalizedToken === "#39") return "'";
      if (normalizedToken === "lt") return "<";
      if (normalizedToken === "gt") return ">";
      if (/^#\d+$/.test(normalizedToken)) {
        const codePoint = Number(normalizedToken.slice(1));
        if (
          Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff &&
          !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return String.fromCodePoint(codePoint);
        }
      }
      return entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
  );
  return match ? decodeXml(match[1]) : "";
}

function parseFeed(
  xml: string,
  sourceId: string,
  reliability: number,
  now: Date,
): Article[] {
  const blocks = [
    ...[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]),
    ...[...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]),
  ];
  const output: Article[] = [];

  for (const block of blocks.slice(0, 100)) {
    const title = tag(block, "title");
    const dateRaw =
      tag(block, "pubDate") ||
      tag(block, "published") ||
      tag(block, "updated") ||
      tag(block, "dc:date");
    const published = new Date(dateRaw);
    if (!title || Number.isNaN(published.getTime())) continue;

    const ageHours = (now.getTime() - published.getTime()) / 3_600_000;
    if (
      ageHours < -10 / 60 ||
      ageHours > FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS
    ) {
      continue;
    }

    const normalizedTitle = normalize(title);
    if (!CHINA_TERMS.some((term) => normalizedTitle.includes(term))) continue;

    const publishedAt = published.toISOString();
    output.push({
      source_id: sourceId,
      source_family: federicoStrictSourceFamilyForId(sourceId),
      reliability,
      title,
      published_at: publishedAt,
      content_hash: sha256(`${normalizedTitle}|${publishedAt}`),
    });
  }

  return output;
}

async function fetchText(url: string) {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.5",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const text = await response.text();
      if (text.length < 80) throw new Error("FEED_TOO_SMALL");
      return text;
    } catch (error) {
      last = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last instanceof Error ? last : new Error(String(last ?? "FEED_FETCH_FAILED"));
}

const now = new Date();
const articles: Article[] = [];
const sources: Array<Record<string, unknown>> = [];

await Promise.all(
  FEEDS.map(async (feed) => {
    try {
      const xml = await fetchText(feed.url);
      const parsed = parseFeed(xml, feed.source_id, feed.reliability, now);
      articles.push(...parsed);
      sources.push({
        source_id: feed.source_id,
        fetch: "PASS",
        fresh_china_items: parsed.length,
      });
    } catch (error) {
      sources.push({
        source_id: feed.source_id,
        fetch: "FAIL",
        reason:
          error instanceof Error
            ? error.message.slice(0, 120)
            : String(error).slice(0, 120),
      });
    }
  }),
);

const matches: Array<{
  source_ids: string[];
  source_families: string[];
  content_hashes: string[];
  published_at: string[];
  similarity: number;
  peer_time_delta_seconds: number;
  verification_score: number;
}> = [];

for (let i = 0; i < articles.length; i++) {
  for (let j = i + 1; j < articles.length; j++) {
    const left = articles[i];
    const right = articles[j];
    if (left.source_family === right.source_family) continue;

    const deltaSeconds = Math.round(
      Math.abs(Date.parse(left.published_at) - Date.parse(right.published_at)) / 1000,
    );
    if (!Number.isFinite(deltaSeconds) || deltaSeconds > MAX_PEER_DELTA_SECONDS) continue;

    const score = similarity(left.title, right.title);
    if (score < FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY) continue;

    const primaryReliability = Math.max(left.reliability, right.reliability);
    const verificationScore = Math.max(
      0,
      Math.min(
        100,
        Math.min(10, primaryReliability * 0.1) + 30 + score * 35 + 15,
      ),
    );
    if (verificationScore < FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD) continue;

    matches.push({
      source_ids: [left.source_id, right.source_id].sort(),
      source_families: [left.source_family, right.source_family].sort(),
      content_hashes: [left.content_hash, right.content_hash].sort(),
      published_at: [left.published_at, right.published_at].sort(),
      similarity: Number(score.toFixed(5)),
      peer_time_delta_seconds: deltaSeconds,
      verification_score: Number(verificationScore.toFixed(3)),
    });
  }
}

matches.sort(
  (a, b) =>
    b.verification_score - a.verification_score ||
    b.similarity - a.similarity ||
    a.peer_time_delta_seconds - b.peer_time_delta_seconds,
);

const output = {
  ok: true,
  schema: "geomacro.day6-live-evidence-probe.v1",
  evaluated_at: now.toISOString(),
  country_iso3: "CHN",
  ready: matches.length > 0,
  policy: {
    max_evidence_age_hours: FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS,
    max_peer_delta_seconds: MAX_PEER_DELTA_SECONDS,
    min_similarity: FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY,
    min_verification_score: FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD,
    minimum_independent_source_families: 2,
  },
  fresh_candidate_count: articles.length,
  qualifying_pair_count: matches.length,
  best_pair: matches[0] ?? null,
  sources: sources.sort((a, b) =>
    String(a.source_id).localeCompare(String(b.source_id)),
  ),
  secrets_required: false,
  supabase_required: false,
  partner_allowance_spent: false,
  execution_authorized: false,
};

console.log(JSON.stringify(output, null, 2));
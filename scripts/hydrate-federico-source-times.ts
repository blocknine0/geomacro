import { createClient } from "@supabase/supabase-js";
import {
  extractTrustedBbcRssPublishedAt,
  extractTrustedPublishedAt,
  isTrustedFedericoTimestampUrlForSource,
  trustedFedericoTimestampFetchUrlForSource,
} from "../src/lib/federico-source-time-hydration";

const SOURCE_IDS = [
  "xinhua_english_china_rss",
  "scmp_china_rss",
  "bbc_world_rss",
  "aljazeera_rss",
  "forexlive_rss",
] as const;
const BBC_WORLD_RSS_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
const BBC_RSS_MAX_BYTES = 5 * 1024 * 1024;
const LOOKBACK_HOURS = 6;
const VERIFIED_FAMILY_ONLY =
  String(process.env.FEDERICO_HYDRATE_VERIFIED_FAMILY_ONLY ?? "")
    .trim()
    .toLowerCase() === "true";
const MAX_ROWS = Math.max(
  1,
  Math.min(
    180,
    Number(process.env.FEDERICO_HYDRATE_MAX_ROWS ?? 180),
  ),
);

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const db = createClient(
  requireEnv("APP_SUPABASE_URL"),
  requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const asOf = new Date();
const cutoff = new Date(
  asOf.getTime() - LOOKBACK_HOURS * 3_600_000,
).toISOString();

let query = db
  .from("live_flash_events")
  .select("flash_id,source_id,source_url,published_at,last_seen_at")
  .in("source_id", [...SOURCE_IDS])
  .is("published_at", null)
  .gte("last_seen_at", cutoff)
  .lte("last_seen_at", asOf.toISOString());

if (VERIFIED_FAMILY_ONLY) {
  query = query
    .eq("verification_status", "VERIFIED")
    .not("event_family_id", "is", null);
}

const result = await query
  .order("last_seen_at", { ascending: false })
  .limit(MAX_ROWS);

if (result.error) throw result.error;

let bbcRssXml: string | null = null;
let bbcRssFetchAttempted = false;
let bbcRssFetchOk = false;
let bbcRssHydrated = 0;

if ((result.data ?? []).some((row) => String(row.source_id ?? "") === "bbc_world_rss")) {
  bbcRssFetchAttempted = true;
  try {
    const response = await fetch(BBC_WORLD_RSS_URL, {
      headers: {
        Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
        "User-Agent":
          "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) {
      const rssXml = await response.text();
      if (Buffer.byteLength(rssXml, "utf8") <= BBC_RSS_MAX_BYTES) {
        bbcRssXml = rssXml;
        bbcRssFetchOk = true;
      }
    }
  } catch {
    // Fail closed. Article-level trusted metadata remains the fallback.
  }
}

let attempted = 0;
let hydrated = 0;
const bySource: Record<string, { attempted: number; hydrated: number }> = {};

for (const sourceId of SOURCE_IDS) {
  bySource[sourceId] = { attempted: 0, hydrated: 0 };
}

for (const row of result.data ?? []) {
  const sourceId = String(row.source_id ?? "").trim();
  const sourceUrl = String(row.source_url ?? "").trim();

  if (
    !SOURCE_IDS.includes(sourceId as (typeof SOURCE_IDS)[number]) ||
    !isTrustedFedericoTimestampUrlForSource(sourceId, sourceUrl)
  ) {
    continue;
  }

  attempted += 1;
  bySource[sourceId].attempted += 1;

  const timestampFetchUrl =
    trustedFedericoTimestampFetchUrlForSource(sourceId, sourceUrl);
  if (!timestampFetchUrl) continue;

  try {
    let publishedAt: string | null = null;
    let timestampBasis: "bbc_rss_pubdate" | "publisher_article_metadata" =
      "publisher_article_metadata";

    if (sourceId === "bbc_world_rss" && bbcRssXml) {
      publishedAt = extractTrustedBbcRssPublishedAt(
        bbcRssXml,
        sourceUrl,
        asOf,
      );
      if (publishedAt) timestampBasis = "bbc_rss_pubdate";
    }

    if (!publishedAt) {
      const response = await fetch(timestampFetchUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "User-Agent":
            "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      publishedAt = extractTrustedPublishedAt(
        html,
        timestampFetchUrl,
        asOf,
      );
    }
    if (!publishedAt) continue;

    const publishedMs = Date.parse(publishedAt);
    if (
      !Number.isFinite(publishedMs) ||
      publishedMs < Date.parse(cutoff) ||
      publishedMs > asOf.getTime()
    ) {
      continue;
    }

    const update = await db
      .from("live_flash_events")
      .update({ published_at: publishedAt })
      .eq("flash_id", row.flash_id)
      .is("published_at", null)
      .select("flash_id");

    if (update.error) throw update.error;
    if ((update.data ?? []).length === 1) {
      hydrated += 1;
      bySource[sourceId].hydrated += 1;
      if (timestampBasis === "bbc_rss_pubdate") bbcRssHydrated += 1;
    }
  } catch {
    // Fail closed: fetch/parse/update failure leaves published_at null and
    // therefore cannot create candidate freshness or corroboration credit.
  }
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.federico-source-time-hydration.v3",
  execution_mode: process.env.GRI_DB_MODE ?? null,
  policy: "trusted_publisher_metadata_only",
  lookback_hours: LOOKBACK_HOURS,
  verified_family_only: VERIFIED_FAMILY_ONLY,
  max_rows: MAX_ROWS,
  attempted,
  hydrated,
  by_source: bySource,
  bbc_rss_pubdate_fallback: {
    feed_url: BBC_WORLD_RSS_URL,
    fetch_attempted: bbcRssFetchAttempted,
    fetch_ok: bbcRssFetchOk,
    hydrated: bbcRssHydrated,
    feed_fetch_time_used_as_publication_time: false,
  },
  threshold_weakening: false,
  fake_freshness: false,
  payment_performed: false,
  execution_authorized: false,
}, null, 2));

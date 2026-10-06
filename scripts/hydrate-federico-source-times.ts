import { createClient } from "@supabase/supabase-js";
import {
  extractTrustedPublishedAt,
  isTrustedFedericoTimestampUrlForSource,
  trustedFedericoTimestampFetchUrlForSource,
} from "../src/lib/federico-source-time-hydration";

const SOURCE_IDS = [
  "xinhua_english_china_rss",
  "scmp_china_rss",
] as const;
const MAX_ROWS = 60;
const LOOKBACK_HOURS = 6;

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

const result = await db
  .from("live_flash_events")
  .select("flash_id,source_id,source_url,published_at,last_seen_at")
  .in("source_id", [...SOURCE_IDS])
  .is("published_at", null)
  .gte("last_seen_at", cutoff)
  .lte("last_seen_at", asOf.toISOString())
  .order("last_seen_at", { ascending: false })
  .limit(MAX_ROWS);

if (result.error) throw result.error;

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
    const publishedAt = extractTrustedPublishedAt(
      html,
      timestampFetchUrl,
      asOf,
    );
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
    }
  } catch {
    // Fail closed: fetch/parse/update failure leaves published_at null and
    // therefore cannot create candidate freshness or corroboration credit.
  }
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.federico-source-time-hydration.v2",
  execution_mode: process.env.GRI_DB_MODE ?? null,
  policy: "trusted_publisher_metadata_only",
  lookback_hours: LOOKBACK_HOURS,
  attempted,
  hydrated,
  by_source: bySource,
  threshold_weakening: false,
  fake_freshness: false,
  payment_performed: false,
  execution_authorized: false,
}, null, 2));

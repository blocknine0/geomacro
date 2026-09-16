import { parseEcbPressRss } from "./ecb-rss-core.mjs";

const FEED_URL = "https://www.ecb.europa.eu/rss/press.html";
const MAX_ITEM_AGE_HOURS = Number(process.env.ECB_RSS_MAX_ITEM_AGE_HOURS ?? 168);
const NOW = new Date(process.env.ECB_RSS_AS_OF ?? Date.now());

if (process.argv.includes("--write") || process.argv.includes("--live")) {
  throw new Error("ECB watcher is prelaunch dry-run only; database/public writes are disabled");
}
if (!Number.isFinite(MAX_ITEM_AGE_HOURS) || MAX_ITEM_AGE_HOURS <= 0 || MAX_ITEM_AGE_HOURS > 24 * 31) {
  throw new Error("ECB_RSS_MAX_ITEM_AGE_HOURS must be between 0 and 744");
}
if (!Number.isFinite(NOW.getTime())) throw new Error("ECB_RSS_AS_OF is invalid");

async function fetchFeed() {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(FEED_URL, {
        headers: {
          accept: "application/rss+xml, application/xml, text/xml;q=0.9",
          "user-agent": "Geomacro-Early-Warning/0.1 (+https://geomacro.live)",
        },
        redirect: "error",
      });
      if (!response.ok) throw new Error(`ECB RSS HTTP ${response.status}`);
      const type = String(response.headers.get("content-type") ?? "").toLowerCase();
      if (type && !type.includes("xml") && !type.includes("rss")) {
        throw new Error(`ECB RSS unexpected content-type: ${type}`);
      }
      return response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error("ECB RSS request failed");
}

const xml = await fetchFeed();
const items = parseEcbPressRss(xml);
const cutoff = NOW.getTime() - MAX_ITEM_AGE_HOURS * 60 * 60 * 1000;
const recent = items
  .filter((item) => new Date(item.published_at_utc).getTime() >= cutoff)
  .sort((a, b) => b.published_at_utc.localeCompare(a.published_at_utc))
  .slice(0, 100);

const byFamily = {};
for (const item of recent) {
  byFamily[item.event_family_candidate] = (byFamily[item.event_family_candidate] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      source_id: "ecb_press_rss",
      mode: "PRELAUNCH_DRY_RUN_ONLY",
      feed_url: FEED_URL,
      retrieved_at_utc: new Date().toISOString(),
      evaluation_at_utc: NOW.toISOString(),
      source_scope: "EURO_AREA",
      source_timezone: "Europe/Brussels",
      rights_status: "REVIEW_REQUIRED",
      commercial_signal_activation: false,
      database_write: false,
      public_publish: false,
      raw_body_stored: false,
      total_feed_items: items.length,
      recent_items: recent.length,
      candidate_family_counts: byFamily,
      candidates: recent.map((item) => ({
        source_record_id: item.source_record_id,
        title: item.title,
        url: item.url,
        published_at_utc: item.published_at_utc,
        event_family_candidate: item.event_family_candidate,
      })),
    },
    null,
    2,
  ),
);

console.log("PASS: ECB PRESS RSS PRELAUNCH DRY RUN; NO DATABASE OR PUBLIC WRITE");

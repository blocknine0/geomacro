type FeedItem = {
  alert_key: string;
  country: { iso3: string; name: string; local_timezone: string };
  event: { family: string; title: string; primary_cause: string };
  early_warning: { status: string; cews_score: number; confidence: number };
  timestamps: { detected_at_local: string; published_at_utc: string };
  public_url: string | null;
  boundaries: {
    structural_pressure_only: true;
    market_price_prediction: false;
    trading_instruction: false;
    public_performance_claims_allowed: false;
  };
};

type PublicFeed = {
  feed_schema_version: string;
  generated_at_utc: string;
  items: FeedItem[];
};

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asRfc822(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid RSS timestamp");
  return date.toUTCString();
}

export function renderPublicEarlyWarningRss(feed: PublicFeed) {
  if (feed.feed_schema_version !== "geomacro.public-early-warning-feed.v1") {
    throw new Error("RSS source feed schema mismatch");
  }
  if (!Array.isArray(feed.items) || feed.items.length > 25) {
    throw new Error("RSS source items are invalid");
  }

  const items = feed.items.map((item) => {
    if (
      item.boundaries.structural_pressure_only !== true ||
      item.boundaries.market_price_prediction !== false ||
      item.boundaries.trading_instruction !== false ||
      item.boundaries.public_performance_claims_allowed !== false
    ) {
      throw new Error("RSS item safety boundary mismatch");
    }
    const link = item.public_url || "https://geomacro.live";
    const description = [
      item.event.primary_cause,
      `CEWS: ${item.early_warning.cews_score} (${item.early_warning.status})`,
      `Confidence: ${Math.round(item.early_warning.confidence * 100)}%`,
      `Detected: ${item.timestamps.detected_at_local} (${item.country.local_timezone})`,
      "Structured risk intelligence for informational decision support.",
    ].join("\n");
    return [
      "    <item>",
      `      <guid isPermaLink="false">${escapeXml(item.alert_key)}</guid>`,
      `      <title>${escapeXml(`Geomacro ${item.early_warning.status} · ${item.country.name} (${item.country.iso3})`)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <category>${escapeXml(item.event.family)}</category>`,
      `      <description>${escapeXml(description)}</description>`,
      `      <pubDate>${escapeXml(asRfc822(item.timestamps.published_at_utc))}</pubDate>`,
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Geomacro Early Warning</title>",
    "    <link>https://geomacro.live</link>",
    "    <description>Verified geopolitical and macro early-warning signals from Geomacro.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${escapeXml(asRfc822(feed.generated_at_utc))}</lastBuildDate>`,
    '    <atom:link href="https://geomacro.live/api/early-warning?format=rss" rel="self" type="application/rss+xml" />',
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

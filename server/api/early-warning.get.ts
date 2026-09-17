import {
  defineEventHandler,
  getRequestURL,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import {
  PUBLIC_EARLY_WARNING_FEED_VERSION,
  loadPublicEarlyWarningFeed,
} from "../../src/lib/public-early-warning-feed.server";
import { renderPublicEarlyWarningRss } from "../../src/lib/public-early-warning-rss";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const PUBLIC_HEADERS = {
  ...BASE_HEADERS,
  "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
} as const;

function errorPayload(code: string) {
  return {
    feed_schema_version: PUBLIC_EARLY_WARNING_FEED_VERSION,
    error: code,
    items: [],
    boundaries: {
      informational_decision_support: true,
      structural_pressure_only: true,
      market_price_prediction: false,
      trading_instruction: false,
      performance_claim: false,
    },
  } as const;
}

/**
 * Native Nitro route for the canonical public Early Warning feed.
 *
 * Keep this API surface outside the TanStack renderer so a renderer/runtime
 * failure cannot turn a bounded public machine feed into an opaque HTTP 500.
 * The shared loader remains the single data-shaping/non-leakage contract.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const country = url.searchParams.get("country");
  const limit = url.searchParams.get("limit");
  const format = (url.searchParams.get("format") || "json").trim().toLowerCase();

  if (format !== "json" && format !== "rss") {
    setResponseStatus(event, 400);
    setResponseHeaders(event, {
      ...BASE_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    return errorPayload("invalid_query");
  }

  try {
    const feed = await loadPublicEarlyWarningFeed({ country, limit });

    if (format === "rss") {
      setResponseHeaders(event, {
        ...PUBLIC_HEADERS,
        "Content-Type": "application/rss+xml; charset=utf-8",
      });
      return renderPublicEarlyWarningRss(feed);
    }

    setResponseHeaders(event, {
      ...PUBLIC_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    });
    return feed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const invalidQuery =
      message.startsWith("country must") || message.startsWith("limit must");

    setResponseStatus(event, invalidQuery ? 400 : 503);
    setResponseHeaders(event, {
      ...BASE_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });

    return errorPayload(invalidQuery ? "invalid_query" : "feed_unavailable");
  }
});

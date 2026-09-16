import { createFileRoute } from "@tanstack/react-router";

import {
  PUBLIC_EARLY_WARNING_FEED_VERSION,
  loadPublicEarlyWarningFeed,
} from "../lib/public-early-warning-feed.server";
import { renderPublicEarlyWarningRss } from "../lib/public-early-warning-rss";

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

const RSS_HEADERS = {
  ...PUBLIC_HEADERS,
  "Content-Type": "application/rss+xml; charset=utf-8",
} as const;

const ERROR_HEADERS = {
  ...BASE_HEADERS,
  "Cache-Control": "no-store",
} as const;

function errorResponse(status: number, code: string) {
  return Response.json(
    {
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
    },
    { status, headers: ERROR_HEADERS },
  );
}

export const Route = createFileRoute("/api/early-warning")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: PUBLIC_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const country = url.searchParams.get("country");
        const limit = url.searchParams.get("limit");
        const format = (url.searchParams.get("format") || "json").trim().toLowerCase();

        if (format !== "json" && format !== "rss") {
          return errorResponse(400, "invalid_query");
        }

        try {
          const feed = await loadPublicEarlyWarningFeed({ country, limit });
          if (format === "rss") {
            return new Response(renderPublicEarlyWarningRss(feed), {
              status: 200,
              headers: RSS_HEADERS,
            });
          }
          return Response.json(feed, { status: 200, headers: PUBLIC_HEADERS });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.startsWith("country must") || message.startsWith("limit must")) {
            return errorResponse(400, "invalid_query");
          }
          return errorResponse(503, "feed_unavailable");
        }
      },
    },
  },
});

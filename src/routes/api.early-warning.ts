import { createFileRoute } from "@tanstack/react-router";

import {
  PUBLIC_EARLY_WARNING_FEED_VERSION,
  boundedPublicEarlyWarningRow,
} from "../lib/public-early-warning-feed.server";
import { renderPublicEarlyWarningRss } from "../lib/public-early-warning-rss";

const PUBLIC_EARLY_WARNING_EDGE_URL =
  "https://ldpwajisioljyjtojvfx.supabase.co/functions/v1/public-early-warning";
const PUBLIC_EARLY_WARNING_EDGE_CONTRACT = "public-early-warning-edge-v1";
const PUBLIC_EARLY_WARNING_EDGE_TIMEOUT_MS = 12_000;

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

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("public early warning edge payload is invalid");
  }
  return value as Record<string, unknown>;
}

function normalizeCountry(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("country must be ISO3 uppercase text");
  }
  return normalized;
}

function normalizeLimit(value: string | null) {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
    throw new Error("limit must be an integer from 1 to 25");
  }
  return parsed;
}

async function loadPublicEarlyWarningFeedFromEdge(input: {
  country?: string | null;
  limit?: string | null;
}) {
  const country = normalizeCountry(input.country ?? null);
  const limit = normalizeLimit(input.limit ?? null);

  const endpoint = new URL(PUBLIC_EARLY_WARNING_EDGE_URL);
  endpoint.searchParams.set("limit", String(limit));
  if (country) endpoint.searchParams.set("country", country);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(PUBLIC_EARLY_WARNING_EDGE_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[public-early-warning] edge request failed", error);
    throw new Error("public early warning feed unavailable");
  }

  if (!response.ok) {
    console.error("[public-early-warning] edge returned non-200", response.status);
    throw new Error("public early warning feed unavailable");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("public early warning feed unavailable");
  }

  let payload: Record<string, unknown>;
  try {
    payload = record(await response.json());
  } catch {
    throw new Error("public early warning feed unavailable");
  }

  if (
    payload.ok !== true ||
    payload.contract_version !== PUBLIC_EARLY_WARNING_EDGE_CONTRACT ||
    !Array.isArray(payload.rows) ||
    payload.rows.length > limit
  ) {
    throw new Error("public early warning feed unavailable");
  }

  const items = payload.rows.map(boundedPublicEarlyWarningRow);
  return {
    feed_schema_version: PUBLIC_EARLY_WARNING_FEED_VERSION,
    generated_at_utc: new Date().toISOString(),
    filters: { country, limit },
    count: items.length,
    items,
    boundaries: {
      informational_decision_support: true as const,
      structural_pressure_only: true as const,
      market_price_prediction: false as const,
      trading_instruction: false as const,
      performance_claim: false as const,
    },
  };
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
          const feed = await loadPublicEarlyWarningFeedFromEdge({ country, limit });
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

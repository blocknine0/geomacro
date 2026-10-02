import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readProductionPublicIntelligence } from "../../../src/lib/public-intelligence-production.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });

  try {
    const payload = await readProductionPublicIntelligence();
    if (!payload.rows.length) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        error: "INTELLIGENCE_UNAVAILABLE",
        ...payload,
      };
    }
    return { ok: true, ...payload };
  } catch (error) {
    console.error(
      "[api/public/intelligence] unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: "INTELLIGENCE_UNAVAILABLE",
      rows: [],
      mode: "live_observed_only",
      verified_rows: 0,
      live_observed_rows: 0,
      newest_at: null,
      current_within_24h: false,
      generated_at: new Date().toISOString(),
    };
  }
});

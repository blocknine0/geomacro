import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readProductionPublicIntelligence } from "../../../src/lib/public-intelligence-production.server";

export default defineEventHandler(async (event) => {
  // Freshness is a correctness property for this endpoint. Do not let an
  // intermediary/CDN retain a scored-only package after the canonical B2
  // object has advanced. The B2 reader keeps its own bounded 120-second
  // in-process cache, so this does not turn each public request into a B2 GET.
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store",
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

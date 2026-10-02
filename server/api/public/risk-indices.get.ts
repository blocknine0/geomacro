import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readB2PublicRisk } from "../../../src/lib/b2-live.server";
import { riskIndicesFromGlobalRisk } from "../../../src/lib/risk-indices-from-global-risk";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });

  try {
    const risk = await readB2PublicRisk();
    if (!risk) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "RISK_INDICES_UNAVAILABLE",
        message: "The latest verified B2 risk package is temporarily unavailable.",
      };
    }

    return { ok: true, data: riskIndicesFromGlobalRisk(risk) };
  } catch (error) {
    console.error(
      "[api/public/risk-indices] unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return {
      ok: false,
      code: "RISK_INDICES_UNAVAILABLE",
      message: "The latest verified B2 risk package is temporarily unavailable.",
    };
  }
});

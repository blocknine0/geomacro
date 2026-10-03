import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readRiskIndicesEdge } from "../../../src/lib/risk-indices-edge.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });

  try {
    const data = await readRiskIndicesEdge();
    if (!data) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "RISK_INDICES_UNAVAILABLE",
        message: "The latest verified risk indices package is temporarily unavailable.",
      };
    }

    return {
      ok: true,
      data,
      meta: {
        authority: "backblaze-b2-risk-indices-edge",
        transport: "verified-risk-indices-cloudflare-edge",
        snapshot_as_of: data.snapshotAsOf,
      },
    };
  } catch (error) {
    console.error(
      "[api/public/risk-indices] unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return {
      ok: false,
      code: "RISK_INDICES_UNAVAILABLE",
      message: "The latest verified risk indices package is temporarily unavailable.",
    };
  }
});

import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readGlobalRiskEdge } from "../../../src/lib/global-risk-edge.server";
import { riskIndicesFromGlobalRisk } from "../../../src/lib/risk-indices-from-global-risk";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });

  try {
    // Keep Lovable free of private B2 credentials and gzip/decompression
    // runtime requirements. The proof-validating Cloudflare edge is the
    // canonical public read boundary; this route only projects its verified
    // Global Risk package into the stable three-index contract.
    const risk = await readGlobalRiskEdge();
    if (!risk) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "RISK_INDICES_UNAVAILABLE",
        message: "The latest verified risk package is temporarily unavailable.",
      };
    }

    return {
      ok: true,
      data: riskIndicesFromGlobalRisk(risk),
      meta: {
        authority: "backblaze-b2-verified-edge",
        transport: "verified-cloudflare-edge",
        snapshot_as_of: risk.snapshotAsOf,
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
      message: "The latest verified risk package is temporarily unavailable.",
    };
  }
});

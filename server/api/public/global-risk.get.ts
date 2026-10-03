import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readGlobalRiskEdge } from "../../../src/lib/global-risk-edge.server";
import { validateGlobalRiskContinuity } from "../../../src/lib/global-risk-continuity";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });

  try {
    // Lovable is a public compatibility transport only. Do not import or
    // initialize the signed/private B2 client in this runtime: the Cloudflare
    // edge already performs the proof-bound B2 read and exposes only the
    // verified canonical Global Risk object.
    const risk = await readGlobalRiskEdge();
    if (!risk) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "GLOBAL_RISK_UNAVAILABLE",
        message: "The latest verified Global Risk continuity package is temporarily unavailable.",
      };
    }

    const continuity = validateGlobalRiskContinuity(risk);
    if (!continuity.ok) {
      console.error("[api/public/global-risk] continuity rejected", continuity.code);
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "GLOBAL_RISK_HISTORY_UNAVAILABLE",
        message: "Verified Global Risk history failed continuity validation.",
      };
    }

    return {
      ok: true,
      data: risk,
      meta: {
        authority: "backblaze-b2-verified-edge",
        transport: "verified-cloudflare-edge",
        history: "same-methodology-verified",
        snapshot_as_of: risk.snapshotAsOf,
      },
    };
  } catch (error) {
    console.error(
      "[api/public/global-risk] unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return {
      ok: false,
      code: "GLOBAL_RISK_UNAVAILABLE",
      message: "The latest verified Global Risk continuity package is temporarily unavailable.",
    };
  }
});

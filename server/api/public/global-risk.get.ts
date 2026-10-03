import {
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { readB2PublicRisk } from "../../../src/lib/b2-live.server";
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
    // Prefer a direct signed B2 read when this runtime has server-only B2
    // credentials. Lovable production intentionally does not need those
    // secrets: the read-only Cloudflare edge validates the exact B2 live
    // package + proof binding and exposes only this public risk object.
    const risk = (await readB2PublicRisk()) ?? (await readGlobalRiskEdge());
    if (!risk) {
      setResponseStatus(event, 503);
      return {
        ok: false,
        code: "GLOBAL_RISK_UNAVAILABLE",
        message: "The latest verified B2 Global Risk continuity package is temporarily unavailable.",
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
        authority: "backblaze-b2",
        transport: "direct-or-verified-cloudflare-edge",
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
      message: "The latest verified B2 Global Risk continuity package is temporarily unavailable.",
    };
  }
});

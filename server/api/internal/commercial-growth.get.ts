import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import {
  loadCommercialMarketingDrafts,
  type CommercialMarketingDraftStatus,
} from "../../../src/lib/commercial-growth.server";
import { requireCommercialOpsToken } from "../../../src/lib/commercial-ops.server";

const ALLOWED_STATUSES = new Set<CommercialMarketingDraftStatus | "all">([
  "all",
  "draft",
  "approved",
  "rejected",
  "published",
]);

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  try {
    requireCommercialOpsToken(getRequestHeader(event, "x-geomacro-ops-token"));
    const query = getQuery(event);
    const rawStatus = String(query.status ?? "all").trim() as CommercialMarketingDraftStatus | "all";
    if (!ALLOWED_STATUSES.has(rawStatus)) {
      setResponseStatus(event, 400);
      return {
        ok: false,
        error: { code: "COMMERCIAL_GROWTH_INVALID_STATUS", message: "Invalid draft status." },
      };
    }
    const limit = Number(query.limit ?? 100);
    return {
      ok: true,
      data: await loadCommercialMarketingDrafts({ status: rawStatus, limit }),
      boundaries: {
        owner_only: true,
        automatic_publication: false,
        testnet_revenue_marketing: false,
      },
    };
  } catch (error) {
    if (error instanceof Response) {
      setResponseStatus(event, error.status);
      return {
        ok: false,
        error: { code: "COMMERCIAL_GROWTH_UNAUTHORIZED", message: "Unauthorized." },
      };
    }
    console.error("[commercial-growth] draft load failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: {
        code: "COMMERCIAL_GROWTH_UNAVAILABLE",
        message: "Commercial growth drafts are temporarily unavailable.",
      },
    };
  }
});

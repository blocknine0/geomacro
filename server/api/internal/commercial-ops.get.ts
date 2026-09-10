import {
  defineEventHandler,
  getQuery,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import {
  loadCommercialOpsDashboard,
  requireCommercialOpsAdmin,
} from "../../../src/lib/commercial-ops.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  try {
    requireCommercialOpsAdmin(event.node.req as unknown as Request);
    const query = getQuery(event);
    const days = Number(query.days ?? 30);
    return {
      ok: true,
      data: await loadCommercialOpsDashboard(days),
    };
  } catch (error) {
    if (error instanceof Response) {
      setResponseStatus(event, error.status);
      return {
        ok: false,
        error: { code: "COMMERCIAL_OPS_UNAUTHORIZED", message: "Unauthorized." },
      };
    }
    console.error("[commercial-ops] dashboard load failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: {
        code: "COMMERCIAL_OPS_UNAVAILABLE",
        message: "Commercial operations dashboard is temporarily unavailable.",
      },
    };
  }
});

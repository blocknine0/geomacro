import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import {
  enqueueVerifiedCommercialMilestone,
  reviewCommercialMarketingDraft,
  type VerifiedMarketingTrigger,
} from "../../../src/lib/commercial-growth.server";
import { requireCommercialOpsToken } from "../../../src/lib/commercial-ops.server";

type GrowthRequest =
  | {
      action: "approve" | "reject";
      id: string;
      reviewer?: string;
    }
  | {
      action: "enqueue_verified";
      trigger_type: VerifiedMarketingTrigger;
      trigger_key: string;
      title: string;
      summary: string;
      provider?: string | null;
      public_reference?: string | null;
    };

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  try {
    requireCommercialOpsToken(getRequestHeader(event, "x-geomacro-ops-token"));
    const body = (await readBody(event)) as GrowthRequest | null;
    if (!body || typeof body !== "object" || !("action" in body)) {
      setResponseStatus(event, 400);
      return {
        ok: false,
        error: { code: "COMMERCIAL_GROWTH_INVALID_REQUEST", message: "Invalid request." },
      };
    }

    if (body.action === "approve" || body.action === "reject") {
      const data = await reviewCommercialMarketingDraft({
        id: body.id,
        action: body.action,
        reviewer: body.reviewer,
      });
      return {
        ok: true,
        data,
        publication_performed: false,
      };
    }

    if (body.action === "enqueue_verified") {
      const data = await enqueueVerifiedCommercialMilestone({
        trigger_type: body.trigger_type,
        trigger_key: body.trigger_key,
        title: body.title,
        summary: body.summary,
        provider: body.provider,
        public_reference: body.public_reference,
      });
      return {
        ok: true,
        data,
        publication_performed: false,
      };
    }

    setResponseStatus(event, 400);
    return {
      ok: false,
      error: { code: "COMMERCIAL_GROWTH_UNSUPPORTED_ACTION", message: "Unsupported action." },
    };
  } catch (error) {
    if (error instanceof Response) {
      setResponseStatus(event, error.status);
      return {
        ok: false,
        error: { code: "COMMERCIAL_GROWTH_UNAUTHORIZED", message: "Unauthorized." },
      };
    }
    const message = error instanceof Error ? error.message : "Commercial growth action failed.";
    const invalid = /invalid|unsupported|reviewable|https url/i.test(message);
    console.error("[commercial-growth] action failed", error);
    setResponseStatus(event, invalid ? 400 : 503);
    return {
      ok: false,
      error: {
        code: invalid ? "COMMERCIAL_GROWTH_INVALID_ACTION" : "COMMERCIAL_GROWTH_UNAVAILABLE",
        message: invalid ? message : "Commercial growth action is temporarily unavailable.",
      },
    };
  }
});

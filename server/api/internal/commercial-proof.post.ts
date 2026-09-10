import {
  defineEventHandler,
  getRequestHeader,
  readBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { z } from "zod";

import {
  publishCommercialProofSnapshot,
  requireCommercialOpsToken,
} from "../../../src/lib/commercial-ops.server";

const bodySchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  period_started_at: z.string().datetime(),
  period_ends_at: z.string().datetime(),
  environment_scope: z.array(z.enum(["testnet", "mainnet", "fiat", "sandbox", "internal"])).min(1).max(5),
  expires_at: z.string().datetime().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  try {
    requireCommercialOpsToken(getRequestHeader(event, "x-geomacro-ops-token"));
    const body = bodySchema.parse(await readBody(event));
    if (Date.parse(body.period_ends_at) <= Date.parse(body.period_started_at)) {
      setResponseStatus(event, 400);
      return { ok: false, error: { code: "INVALID_PROOF_PERIOD", message: "Proof end must be after proof start." } };
    }
    const proof = await publishCommercialProofSnapshot(body);
    return {
      ok: true,
      proof,
      public_path: `/proof/commercial/${proof.slug}`,
      boundaries: {
        customer_identity_disclosed: false,
        upstream_news_source_identity_disclosed: false,
        testnet_is_commercial_revenue: false,
      },
    };
  } catch (error) {
    if (error instanceof Response) {
      setResponseStatus(event, error.status);
      return { ok: false, error: { code: "COMMERCIAL_OPS_UNAUTHORIZED", message: "Unauthorized." } };
    }
    console.error("[commercial-proof] publish failed", error);
    setResponseStatus(event, 400);
    return { ok: false, error: { code: "COMMERCIAL_PROOF_CREATE_FAILED", message: "Proof snapshot could not be created." } };
  }
});

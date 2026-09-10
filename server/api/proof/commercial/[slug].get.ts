import {
  defineEventHandler,
  getRouterParam,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import { loadPublishedCommercialProof } from "../../../../src/lib/commercial-ops.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
  });

  const slug = String(getRouterParam(event, "slug") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{7,95}$/.test(slug)) {
    setResponseStatus(event, 404);
    return { ok: false, error: { code: "PROOF_NOT_FOUND", message: "Proof not found." } };
  }

  try {
    const proof = await loadPublishedCommercialProof(slug);
    if (!proof || !proof.integrity.payload_sha256_valid) {
      setResponseStatus(event, 404);
      return { ok: false, error: { code: "PROOF_NOT_FOUND", message: "Proof not found." } };
    }
    return {
      ok: true,
      proof,
      boundaries: {
        customer_identity_disclosed: false,
        upstream_news_source_identity_disclosed: false,
        raw_request_payload_disclosed: false,
        raw_credentials_disclosed: false,
        testnet_is_commercial_revenue: false,
      },
    };
  } catch (error) {
    console.error("[commercial-proof] public proof read failed", error);
    setResponseStatus(event, 503);
    return { ok: false, error: { code: "PROOF_UNAVAILABLE", message: "Proof is temporarily unavailable." } };
  }
});

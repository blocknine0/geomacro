import { defineEventHandler, setResponseHeaders, setResponseStatus } from "h3";

import {
  ensureRiskObjectRuntimePublicKey,
} from "../../../src/lib/risk-object-runtime-public-key.server";

import {
  publicRiskObjectJwks,
} from "../../../src/lib/risk-object-trust-discovery.server";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300, must-revalidate",
    "Content-Type": "application/jwk-set+json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    ensureRiskObjectRuntimePublicKey();
    const jwks = publicRiskObjectJwks();

    if (jwks.keys.length === 0) {
      setResponseStatus(event, 503);
      return {
        keys: [],
        error: "verification_keys_unavailable",
      };
    }

    return jwks;
  } catch {
    setResponseStatus(event, 503);
    return {
      keys: [],
      error: "verification_key_registry_invalid",
    };
  }
});

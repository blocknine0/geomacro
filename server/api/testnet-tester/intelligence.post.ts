import {
  createError,
  defineEventHandler,
  getRequestHeader,
  readBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  CommercialAccessError,
  type CommercialPrincipal,
} from "../../../src/lib/commercial-access.server";
import {
  testnetIntelligenceRequestSchema,
} from "../../../src/lib/testnet-intelligence-contract";
import { preflightTestnetIntelligenceAvailability } from "../../../src/lib/testnet-intelligence-preflight.server";
import {
  deliverTestnetIntelligence,
} from "../../../src/lib/testnet-intelligence-service.server";
import { bindTestnetIntelligenceRequest } from "../../../src/lib/testnet-request-binding.server";
import {
  testnetPublicAccessByApiKey,
} from "../../../src/lib/testnet-public-access-contract";
import {
  acquireTestnetPublicSlot,
  checkTestnetPublicRateLimit,
} from "../../../src/lib/testnet-public-protection.server";
import { loadTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

function publicFailure(event: unknown, status: number, code: string, message: string, retryAfter?: number) {
  setResponseStatus(event as never, status);
  if (retryAfter) {
    setResponseHeaders(event as never, { "Retry-After": String(retryAfter) });
  }
  return {
    ok: false,
    error: { code, message },
    boundaries: {
      raw_data_included: false,
      private_warehouse_access: false,
      upstream_news_source_identity_exposed: false,
      execution_authorized: false,
    },
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  const session = await requireTesterPrincipal(event);
  const account = await loadTestnetTesterAccount(session.principalId);
  if (account.registration_status !== "complete" || account.access_status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "TESTNET_TESTER_ACCESS_NOT_ACTIVE" });
  }

  const publicApiKey = getRequestHeader(event, "x-geomacro-public-key") ?? "";
  const publicAccess = testnetPublicAccessByApiKey(publicApiKey);
  if (!publicAccess) {
    return publicFailure(
      event,
      401,
      "TESTNET_PUBLIC_API_KEY_REQUIRED",
      "Choose one of the three published Geomacro Testnet public API keys.",
    );
  }

  const rate = checkTestnetPublicRateLimit({
    principalId: session.principalId,
    publicApiKey: publicAccess.public_api_key,
  });
  if (!rate.allowed) {
    return publicFailure(
      event,
      429,
      "TESTNET_PUBLIC_RATE_LIMITED",
      "Too many public Testnet requests. Retry after the indicated delay.",
      rate.retryAfterSeconds,
    );
  }

  const release = acquireTestnetPublicSlot({
    principalId: session.principalId,
    publicApiKey: publicAccess.public_api_key,
  });
  if (!release) {
    return publicFailure(
      event,
      429,
      "TESTNET_PUBLIC_CONCURRENCY_LIMITED",
      "Too many Testnet requests are already in progress. Retry shortly.",
      2,
    );
  }

  const principal: CommercialPrincipal = {
    principal_id: session.principalId,
    principal_type: "testnet_tester",
    principal_external_id: `browser_session:${publicAccess.chain_key}`,
    key_id: publicAccess.public_api_key,
    scopes: [
      "testnet:structured",
      "testnet:risk-object",
      "testnet:risk-gate",
      "testnet:agent",
    ],
  };

  try {
    const request = testnetIntelligenceRequestSchema.parse(await readBody(event));
    if (request.payment && request.payment.chain_key !== publicAccess.chain_key) {
      throw new CommercialAccessError(
        400,
        "TESTNET_PUBLIC_KEY_PAYMENT_CHAIN_MISMATCH",
        `This public API key is bound to ${publicAccess.label}. Use the matching Testnet payment chain.`,
      );
    }

    await preflightTestnetIntelligenceAvailability(request);
    const requestBinding = await bindTestnetIntelligenceRequest({ principal, request });
    const result = await deliverTestnetIntelligence({
      principal,
      request,
      access_surface: "testnet_tester",
    });

    setResponseStatus(event, result.status);
    if (result.status === 402) {
      const supportedChains = result.body.payment.supported_chains.filter(
        (chain) => chain.key === publicAccess.chain_key,
      );
      return {
        ...result.body,
        payment: {
          ...result.body.payment,
          supported_chains: supportedChains,
        },
        public_access: {
          chain_key: publicAccess.chain_key,
          label: publicAccess.label,
          public_api_key: publicAccess.public_api_key,
          public_key_is_secret: false,
        },
        request_binding: requestBinding,
      };
    }

    return {
      ...result.body,
      public_access: {
        chain_key: publicAccess.chain_key,
        label: publicAccess.label,
        public_api_key: publicAccess.public_api_key,
        public_key_is_secret: false,
      },
      request_binding: requestBinding,
    };
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      setResponseStatus(event, error.status);
      return {
        ok: false,
        error: { code: error.code, message: error.message },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          upstream_news_source_identity_exposed: false,
          execution_authorized: false,
        },
      };
    }

    if (error instanceof ZodError) {
      setResponseStatus(event, 400);
      return {
        ok: false,
        error: {
          code: "INVALID_TESTNET_INTELLIGENCE_REQUEST",
          message: "Testnet intelligence request fields are invalid.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          upstream_news_source_identity_exposed: false,
          execution_authorized: false,
        },
      };
    }

    console.error("[testnet-tester-intelligence] request failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: {
        code: "TESTNET_INTELLIGENCE_UNAVAILABLE",
        message: "Testnet intelligence is temporarily unavailable.",
      },
      boundaries: {
        raw_data_included: false,
        private_warehouse_access: false,
        upstream_news_source_identity_exposed: false,
        execution_authorized: false,
      },
    };
  } finally {
    release();
  }
});
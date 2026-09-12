import {
  createError,
  defineEventHandler,
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
import { loadTestnetTesterAccount } from "../../../src/lib/testnet-tester-account.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

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

  const principal: CommercialPrincipal = {
    principal_id: session.principalId,
    principal_type: "testnet_tester",
    principal_external_id: "browser_session",
    key_id: "tester_browser_session",
    scopes: [
      "testnet:structured",
      "testnet:risk-object",
      "testnet:risk-gate",
      "testnet:agent",
    ],
  };

  try {
    const request = testnetIntelligenceRequestSchema.parse(await readBody(event));
    await preflightTestnetIntelligenceAvailability(request);
    const result = await deliverTestnetIntelligence({
      principal,
      request,
      access_surface: "testnet_tester",
    });
    setResponseStatus(event, result.status);
    return result.body;
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
  }
});

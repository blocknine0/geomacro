import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
} from "../../../src/lib/commercial-access.server";
import {
  testnetIntelligenceRequestSchema,
} from "../../../src/lib/testnet-intelligence-contract";
import { preflightTestnetIntelligenceAvailability } from "../../../src/lib/testnet-intelligence-preflight.server";
import {
  deliverTestnetIntelligence,
} from "../../../src/lib/testnet-intelligence-service.server";
import { bindTestnetIntelligenceRequest } from "../../../src/lib/testnet-request-binding.server";

const MAX_BODY_BYTES = 12 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function failure(error: unknown) {
  if (error instanceof CommercialAccessError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          upstream_news_source_identity_exposed: false,
          execution_authorized: false,
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
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
      },
    };
  }

  console.error("[testnet-developer-api] request failed", error);
  return {
    status: 503,
    body: {
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
    },
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);

  try {
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new CommercialAccessError(
        415,
        "CONTENT_TYPE_REQUIRED",
        "Content-Type must be application/json.",
      );
    }

    const declared = Number(getRequestHeader(event, "content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new CommercialAccessError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
    }

    const rawBody = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new CommercialAccessError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody) as unknown;
    } catch {
      throw new CommercialAccessError(400, "INVALID_JSON", "Request body is not valid JSON.");
    }

    const authorization = getRequestHeader(event, "authorization") ?? "";
    const apiKey = getRequestHeader(event, "x-geomacro-api-key") ?? "";
    const apiSecret = getRequestHeader(event, "x-geomacro-api-secret") ?? "";
    const authRequest = new Request("https://geomacro.local/api/testnet/intelligence", {
      headers: {
        authorization,
        "x-geomacro-api-key": apiKey,
        "x-geomacro-api-secret": apiSecret,
      },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    const request = testnetIntelligenceRequestSchema.parse(raw);
    await preflightTestnetIntelligenceAvailability(request);

    const requestBinding = await bindTestnetIntelligenceRequest({ principal, request });
    const result = await deliverTestnetIntelligence({
      principal,
      request,
      access_surface: "commercial_api",
    });

    setResponseStatus(event, result.status);
    return {
      ...result.body,
      request_binding: requestBinding,
    };
  } catch (error) {
    const result = failure(error);
    setResponseStatus(event, result.status);
    return result.body;
  }
});

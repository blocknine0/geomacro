import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
  type CommercialPrincipal,
} from "../../../src/lib/commercial-access.server";
import {
  hasTestnetCapabilityScope,
  requiredTestnetScopeForCapability,
} from "../../../src/lib/testnet-developer-scopes";
import {
  testnetIntelligenceRequestSchema,
  type TestnetIntelligenceRequest,
} from "../../../src/lib/testnet-intelligence-contract";
import { preflightTestnetIntelligenceAvailability } from "../../../src/lib/testnet-intelligence-preflight.server";
import {
  deliverTestnetIntelligence,
} from "../../../src/lib/testnet-intelligence-service.server";
import {
  recordTestnetDeveloperApiFunnelEvent,
  type TestnetDeveloperApiFunnelStage,
} from "../../../src/lib/testnet-api-funnel-telemetry.server";
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
  setResponseHeaders(event, { ...corsHeaders });

  const attemptId = randomUUID();
  const requestStartedAt = Date.now();
  let stage: TestnetDeveloperApiFunnelStage = "request_received";
  let principal: CommercialPrincipal | null = null;
  let request: TestnetIntelligenceRequest | null = null;

  const recordStage = async (
    nextStage: TestnetDeveloperApiFunnelStage,
    outcome: "started" | "passed" | "failed" | "required" | "skipped",
    input: {
      http_status?: number | null;
      error_code?: string | null;
      stage_started_at?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ) => {
    stage = nextStage;
    await recordTestnetDeveloperApiFunnelEvent({
      attempt_id: attemptId,
      principal_id: principal?.principal_id ?? null,
      key_id: principal?.key_id ?? null,
      request_id: request?.request_id ?? null,
      capability: request?.capability ?? null,
      subject_type:
        request?.capability === "intelligence_query"
          ? "query"
          : request?.capability === "gri_read"
            ? "global"
            : request?.subject?.type ?? null,
      subject_key: request?.subject
        ? `${request.subject.type}:${request.subject.id}`
        : null,
      stage: nextStage,
      outcome,
      http_status: input.http_status ?? null,
      error_code: input.error_code ?? null,
      latency_ms:
        input.stage_started_at === undefined
          ? null
          : Math.max(0, Date.now() - input.stage_started_at),
      metadata: input.metadata ?? {},
    });
  };

  await recordStage("request_received", "started", {
    metadata: { endpoint: "/api/testnet/intelligence" },
  });

  try {
    stage = "request_validation";
    const validationStartedAt = Date.now();

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

    request = testnetIntelligenceRequestSchema.parse(raw);
    await recordStage("request_validation", "passed", {
      stage_started_at: validationStartedAt,
      metadata: { body_valid: true },
    });

    stage = "authentication";
    const authStartedAt = Date.now();
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
    principal = await authenticateCommercialApiRequest(authRequest);
    await recordStage("authentication", "passed", {
      stage_started_at: authStartedAt,
      metadata: { principal_authenticated: true },
    });

    stage = "scope_authorization";
    const scopeStartedAt = Date.now();
    if (!hasTestnetCapabilityScope({
      keyId: principal.key_id,
      scopes: principal.scopes,
      capability: request.capability,
    })) {
      const requiredScope = requiredTestnetScopeForCapability(request.capability);
      throw new CommercialAccessError(
        403,
        "TESTNET_API_SCOPE_REQUIRED",
        `This Testnet developer credential does not include the required scope: ${requiredScope}.`,
      );
    }
    await recordStage("scope_authorization", "passed", {
      stage_started_at: scopeStartedAt,
      metadata: { scope_authorized: true },
    });

    stage = "availability_preflight";
    const preflightStartedAt = Date.now();
    await preflightTestnetIntelligenceAvailability(request);
    await recordStage("availability_preflight", "passed", {
      stage_started_at: preflightStartedAt,
    });

    stage = "request_binding";
    const bindingStartedAt = Date.now();
    const requestBinding = await bindTestnetIntelligenceRequest({ principal, request });
    await recordStage("request_binding", "passed", {
      stage_started_at: bindingStartedAt,
    });

    stage = "intelligence_delivery";
    const result = await deliverTestnetIntelligence({
      principal,
      request,
      access_surface: "commercial_api",
      funnel_attempt_id: attemptId,
    });

    setResponseStatus(event, result.status);

    if (result.status === 402) {
      await recordStage("completed", "required", {
        http_status: 402,
        metadata: {
          payment_required: true,
          total_request_latency_ms: Date.now() - requestStartedAt,
        },
      });
    } else {
      await recordStage("completed", "passed", {
        http_status: 200,
        metadata: {
          delivery_completed: true,
          total_request_latency_ms: Date.now() - requestStartedAt,
        },
      });
    }

    return {
      ...result.body,
      request_binding: requestBinding,
    };
  } catch (error) {
    const result = failure(error);
    await recordStage(stage, "failed", {
      http_status: result.status,
      error_code:
        error instanceof CommercialAccessError
          ? error.code
          : error instanceof ZodError
            ? "INVALID_TESTNET_INTELLIGENCE_REQUEST"
            : "TESTNET_INTELLIGENCE_UNAVAILABLE",
      metadata: {
        total_request_latency_ms: Date.now() - requestStartedAt,
      },
    });
    setResponseStatus(event, result.status);
    return result.body;
  }
});

import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  evaluateCountryRiskGate,
  type CountryRiskGateServiceInput,
} from "./risk-gate-service.server";

import type {
  RiskGatePolicy,
} from "./risk-gate-contract";


type ApiClientRow = {
  client_id: string;
  display_name: string;
  api_key_hash: string;
  enabled: boolean;
  requests_per_minute: number;
};


type RateLimitRow = {
  allowed: boolean;
  request_count: number;
  limit_count: number;
  window_started_at: string;
};


export type ExternalRiskGateBody = {
  request_id: string;

  country_iso3: string;

  evaluated_at?: string;

  action_context?: {
    action_type?: string;
    amount?: number;
    currency?: string;
    destination?: string;

    metadata?: Record<
      string,
      unknown
    >;
  };

  policy: RiskGatePolicy;
};


export class RiskGateApiError
  extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "RiskGateApiError";

    this.status =
      status;

    this.code =
      code;
  }
}


function sha256(
  value: unknown,
): string {
  const input =
    typeof value === "string"
      ? value
      : JSON.stringify(value);

  return createHash("sha256")
    .update(input)
    .digest("hex");
}


function secureHashEqual(
  left: string,
  right: string,
): boolean {
  const a =
    Buffer.from(
      left,
      "utf8",
    );

  const b =
    Buffer.from(
      right,
      "utf8",
    );

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  return timingSafeEqual(
    a,
    b,
  );
}


function requiredString(
  value: unknown,
  field: string,
  maxLength = 256,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be a string`,
    );
  }

  const result =
    value.trim();

  if (
    !result ||
    result.length >
      maxLength
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} is invalid`,
    );
  }

  return result;
}


function optionalFiniteNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be a finite number`,
    );
  }

  return value;
}


function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}


export function
parseExternalRiskGateBody(
  value: unknown,
): ExternalRiskGateBody {
  if (!isRecord(value)) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "Request body must be a JSON object",
    );
  }

  const requestId =
    requiredString(
      value.request_id,
      "request_id",
      256,
    );

  const countryIso3 =
    requiredString(
      value.country_iso3,
      "country_iso3",
      3,
    )
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      countryIso3,
    )
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "country_iso3 must be ISO3 format",
    );
  }

  let evaluatedAt:
    string | undefined;

  if (
    value.evaluated_at !==
      undefined
  ) {
    evaluatedAt =
      requiredString(
        value.evaluated_at,
        "evaluated_at",
        64,
      );

    if (
      !Number.isFinite(
        new Date(
          evaluatedAt,
        ).getTime(),
      )
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "evaluated_at must be a valid timestamp",
      );
    }
  }

  let actionContext:
    ExternalRiskGateBody[
      "action_context"
    ];

  if (
    value.action_context !==
      undefined
  ) {
    if (
      !isRecord(
        value.action_context,
      )
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "action_context must be an object",
      );
    }

    const source =
      value.action_context;

    const metadata =
      source.metadata;

    if (
      metadata !== undefined &&
      !isRecord(metadata)
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "action_context.metadata must be an object",
      );
    }

    actionContext = {
      action_type:
        source.action_type ===
          undefined
          ? undefined
          : requiredString(
              source.action_type,
              "action_context.action_type",
              128,
            ),

      amount:
        optionalFiniteNumber(
          source.amount,
          "action_context.amount",
        ),

      currency:
        source.currency ===
          undefined
          ? undefined
          : requiredString(
              source.currency,
              "action_context.currency",
              32,
            ),

      destination:
        source.destination ===
          undefined
          ? undefined
          : requiredString(
              source.destination,
              "action_context.destination",
              256,
            ),

      metadata:
        metadata as
          | Record<
              string,
              unknown
            >
          | undefined,
    };
  }

  if (
    !isRecord(value.policy)
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "policy must be an object",
    );
  }

  const policy =
    value.policy as RiskGatePolicy;

  requiredString(
    policy.policy_id,
    "policy.policy_id",
    256,
  );

  requiredString(
    policy.policy_version,
    "policy.policy_version",
    128,
  );

  return {
    request_id:
      requestId,

    country_iso3:
      countryIso3,

    evaluated_at:
      evaluatedAt,

    action_context:
      actionContext,

    policy,
  };
}


function extractBearerToken(
  request: Request,
): string {
  const header =
    request.headers.get(
      "authorization",
    );

  if (!header) {
    throw new RiskGateApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Bearer API key required",
    );
  }

  const match =
    header.match(
      /^Bearer\s+(.+)$/i,
    );

  if (!match) {
    throw new RiskGateApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Invalid Authorization header",
    );
  }

  const token =
    match[1]?.trim();

  if (
    !token ||
    token.length < 32 ||
    token.length > 512
  ) {
    throw new RiskGateApiError(
      401,
      "INVALID_API_KEY",
      "Invalid API key",
    );
  }

  return token;
}


async function
authenticateClient(
  request: Request,
): Promise<ApiClientRow> {
  const token =
    extractBearerToken(
      request,
    );

  const tokenHash =
    sha256(token);

  const db =
    requireRiskSupabase();

  const {
    data,
    error,
  } =
    await db
      .from(
        "risk_gate_api_clients",
      )
      .select(
        [
          "client_id",
          "display_name",
          "api_key_hash",
          "enabled",
          "requests_per_minute",
        ].join(","),
      )
      .eq(
        "api_key_hash",
        tokenHash,
      )
      .maybeSingle();

  if (error) {
    throw new RiskGateApiError(
      503,
      "AUTH_BACKEND_UNAVAILABLE",
      "Risk Gate authentication unavailable",
    );
  }

  if (!data) {
    throw new RiskGateApiError(
      401,
      "INVALID_API_KEY",
      "Invalid API key",
    );
  }

  const client =
    data as unknown as ApiClientRow;

  if (
    !secureHashEqual(
      client.api_key_hash,
      tokenHash,
    )
  ) {
    throw new RiskGateApiError(
      401,
      "INVALID_API_KEY",
      "Invalid API key",
    );
  }

  if (!client.enabled) {
    throw new RiskGateApiError(
      403,
      "CLIENT_DISABLED",
      "Risk Gate client is disabled",
    );
  }

  return client;
}


async function
consumeRateLimit(
  client: ApiClientRow,
): Promise<RateLimitRow> {
  const db =
    requireRiskSupabase();

  const {
    data,
    error,
  } =
    await db.rpc(
      "consume_risk_gate_rate_limit",
      {
        p_client_id:
          client.client_id,

        p_limit:
          client.requests_per_minute,
      },
    );

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw new RiskGateApiError(
      503,
      "RATE_LIMIT_BACKEND_UNAVAILABLE",
      "Risk Gate rate limiter unavailable",
    );
  }

  const row =
    data[0] as RateLimitRow;

  if (!row.allowed) {
    throw new RiskGateApiError(
      429,
      "RATE_LIMIT_EXCEEDED",
      "Risk Gate request limit exceeded",
    );
  }

  return row;
}


async function
persistAudit(
  input: {
    client_id: string;

    request_id: string;

    subject_type:
      "country" | "unknown";

    subject_id: string;

    risk_object_id?:
      string | null;

    methodology_version?:
      string | null;

    policy_id?:
      string | null;

    policy_version?:
      string | null;

    decision?:
      string | null;

    reason_codes?:
      string[];

    execution_authorized:
      boolean;

    http_status: number;

    outcome:
      "delivered" |
      "rejected" |
      "failed";

    request_payload:
      unknown;

    response_payload?:
      unknown;

    evaluated_at?:
      string | null;
  },
) {
  const db =
    requireRiskSupabase();

  const requestHash =
    sha256(
      input.request_payload,
    );

  const responseHash =
    input.response_payload ===
      undefined
      ? null
      : sha256(
          input.response_payload,
        );

  const auditId =
    `rga_${randomUUID()}`;

  const {
    error,
  } =
    await db
      .from(
        "risk_gate_audit_log",
      )
      .insert({
        audit_id:
          auditId,

        client_id:
          input.client_id,

        request_id:
          input.request_id,

        subject_type:
          input.subject_type,

        subject_id:
          input.subject_id,

        risk_object_id:
          input.risk_object_id ??
          null,

        methodology_version:
          input.methodology_version ??
          null,

        policy_id:
          input.policy_id ??
          null,

        policy_version:
          input.policy_version ??
          null,

        decision:
          input.decision ??
          null,

        reason_codes:
          input.reason_codes ??
          [],

        execution_authorized:
          false,

        http_status:
          input.http_status,

        outcome:
          input.outcome,

        request_hash:
          requestHash,

        response_hash:
          responseHash,

        request_payload:
          input.request_payload,

        response_payload:
          input.response_payload ??
          null,

        evaluated_at:
          input.evaluated_at ??
          null,
      });

  if (error) {
    throw new Error(
      `Risk Gate audit persistence failed: ${error.message}`,
    );
  }

  return auditId;
}


export async function
handleExternalRiskGateRequest(
  request: Request,
): Promise<Response> {
  let clientId =
    "unauthenticated";

  let requestPayload:
    unknown = {};

  let parsed:
    ExternalRiskGateBody |
    null = null;

  try {
    const client =
      await authenticateClient(
        request,
      );

    clientId =
      client.client_id;

    await consumeRateLimit(
      client,
    );

    const contentType =
      request.headers.get(
        "content-type",
      ) ?? "";

    if (
      !contentType
        .toLowerCase()
        .includes(
          "application/json",
        )
    ) {
      throw new RiskGateApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json",
      );
    }

    try {
      requestPayload =
        await request.json();
    } catch {
      throw new RiskGateApiError(
        400,
        "INVALID_JSON",
        "Request body is not valid JSON",
      );
    }

    parsed =
      parseExternalRiskGateBody(
        requestPayload,
      );

    const serviceInput:
      CountryRiskGateServiceInput = {
        request_id:
          parsed.request_id,

        country_iso3:
          parsed.country_iso3,

        evaluated_at:
          parsed.evaluated_at,

        action_context:
          parsed.action_context,

        policy:
          parsed.policy,
      };

    const result =
      await evaluateCountryRiskGate(
        serviceInput,
      );

    if (
      result.response
        .execution_authorized !==
      false
    ) {
      throw new Error(
        "Risk Gate execution boundary violated",
      );
    }

    const responsePayload = {
      ok: true,

      risk_gate:
        result.response,

      context:
        result.context,
    };

    const auditId =
      await persistAudit({
        client_id:
          clientId,

        request_id:
          parsed.request_id,

        subject_type:
          "country",

        subject_id:
          parsed.country_iso3,

        risk_object_id:
          result.context
            .risk_object_id,

        methodology_version:
          result.context
            .methodology_version,

        policy_id:
          parsed.policy
            .policy_id,

        policy_version:
          parsed.policy
            .policy_version,

        decision:
          result.response
            .decision,

        reason_codes:
          result.response
            .reason_codes,

        execution_authorized:
          false,

        http_status:
          200,

        outcome:
          "delivered",

        request_payload:
          requestPayload,

        response_payload:
          responsePayload,

        evaluated_at:
          result.context
            .evaluated_at,
      });

    return Response.json(
      {
        ...responsePayload,
        audit_id:
          auditId,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (error) {
    const apiError =
      error instanceof
        RiskGateApiError
        ? error
        : new RiskGateApiError(
            500,
            "RISK_GATE_FAILED",
            "Risk Gate evaluation failed",
          );

    const responsePayload = {
      ok: false,

      error: {
        code:
          apiError.code,

        message:
          apiError.message,
      },

      execution_authorized:
        false,
    };

    /*
     * Only authenticated requests are persisted here.
     * This avoids storing attacker-controlled unauthenticated
     * traffic in the commercial audit ledger.
     */
    if (
      clientId !==
        "unauthenticated"
    ) {
      try {
        const requestId =
          parsed?.request_id ??
          (
            isRecord(
              requestPayload,
            ) &&
            typeof requestPayload
              .request_id ===
              "string"
              ? requestPayload
                  .request_id
              : `rejected_${randomUUID()}`
          );

        const subjectId =
          parsed?.country_iso3 ??
          (
            isRecord(
              requestPayload,
            ) &&
            typeof requestPayload
              .country_iso3 ===
              "string"
              ? requestPayload
                  .country_iso3
              : "UNKNOWN"
          );

        await persistAudit({
          client_id:
            clientId,

          request_id:
            requestId,

          subject_type:
            parsed
              ? "country"
              : "unknown",

          subject_id:
            subjectId,

          policy_id:
            parsed?.policy
              .policy_id ??
            null,

          policy_version:
            parsed?.policy
              .policy_version ??
            null,

          execution_authorized:
            false,

          http_status:
            apiError.status,

          outcome:
            apiError.status >= 500
              ? "failed"
              : "rejected",

          request_payload:
            requestPayload,

          response_payload:
            responsePayload,

          evaluated_at:
            parsed?.evaluated_at ??
            null,
        });
      } catch (
        auditError
      ) {
        console.error(
          "[risk-gate] audit persistence failed",
          auditError,
        );

        /*
         * Fail closed.
         * A successful commercial decision must never be
         * returned without its immutable audit record.
         *
         * For an already-failed request we retain the
         * original failure response.
         */
      }
    }

    return Response.json(
      responsePayload,
      {
        status:
          apiError.status,

        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  }
}

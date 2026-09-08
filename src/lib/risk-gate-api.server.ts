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
} from "./risk-gate-service.server";

import {
  evaluateCorridorRiskGate,
} from "./corridor-risk-gate-service.server";

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


type ExternalRiskGateActionContext = {
  action_type?: string;
  amount?: number;
  currency?: string;
  destination?: string;

  metadata?: Record<
    string,
    unknown
  >;
};


type ExternalRiskGateBase = {
  request_id: string;

  /**
   * Optional caller timestamp used only to absorb normal
   * client/server clock skew. The external live-preflight API
   * rejects historical/future evaluation times outside the
   * configured tolerance so callers cannot select a stale
   * historical risk state for a current financial action.
   */
  evaluated_at?: string;

  action_context?:
    ExternalRiskGateActionContext;

  policy: RiskGatePolicy;
};


export type ExternalCountryRiskGateBody =
  ExternalRiskGateBase & {
    subject_type: "country";
    subject_id: string;
    country_iso3: string;
  };


export type ExternalCorridorRiskGateBody =
  ExternalRiskGateBase & {
    subject_type: "corridor";
    subject_id: string;

    origin_country_iso3:
      string;

    destination_country_iso3:
      string;
  };


export type ExternalRiskGateBody =
  | ExternalCountryRiskGateBody
  | ExternalCorridorRiskGateBody;


/**
 * External Private Pilot request limits.
 *
 * The API is a decision-context endpoint, not a bulk document
 * upload surface. Keep the body small enough to bound JSON
 * parsing/audit-storage abuse while leaving ample room for
 * policy and action metadata.
 */
export const
RISK_GATE_MAX_REQUEST_BODY_BYTES =
  64 * 1024;


/**
 * Live pre-flight requests may not choose an arbitrary
 * historical/future evaluation clock. Internal service tests
 * can still freeze their own evaluation time directly.
 */
export const
RISK_GATE_MAX_EVALUATION_CLOCK_SKEW_MS =
  5 * 60 * 1000;


const RISK_DRIVER_NAMES =
  new Set([
    "conflict",
    "sanctions",
    "political_instability",
    "trade_policy",
    "monetary_policy",
    "inflation",
    "labor_market",
    "currency_fx",
    "macro_stress",
    "rare_earth_supply",
    "critical_minerals",
    "shipping_logistics",
    "other",
  ]);


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


function finiteNumber(
  value: unknown,
  field: string,
  options?: {
    min?: number;
    max?: number;
  },
): number {
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

  if (
    options?.min !== undefined &&
    value < options.min
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be >= ${options.min}`,
    );
  }

  if (
    options?.max !== undefined &&
    value > options.max
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be <= ${options.max}`,
    );
  }

  return value;
}


function optionalFiniteNumber(
  value: unknown,
  field: string,
  options?: {
    min?: number;
    max?: number;
  },
): number | undefined {
  if (
    value === undefined
  ) {
    return undefined;
  }

  return finiteNumber(
    value,
    field,
    options,
  );
}


function requiredBoolean(
  value: unknown,
  field: string,
): boolean {
  if (
    typeof value !== "boolean"
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      `${field} must be a boolean`,
    );
  }

  return value;
}


function parseExternalPolicy(
  value: unknown,
): RiskGatePolicy {
  if (!isRecord(value)) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "policy must be an object",
    );
  }

  const policyId =
    requiredString(
      value.policy_id,
      "policy.policy_id",
      256,
    );

  const policyVersion =
    requiredString(
      value.policy_version,
      "policy.policy_version",
      128,
    );

  const continueMaxScore =
    finiteNumber(
      value.continue_max_score,
      "policy.continue_max_score",
      {
        min: 0,
        max: 100,
      },
    );

  const reduceLimitMaxScore =
    finiteNumber(
      value.reduce_limit_max_score,
      "policy.reduce_limit_max_score",
      {
        min: 0,
        max: 100,
      },
    );

  const requireApprovalMaxScore =
    finiteNumber(
      value.require_approval_max_score,
      "policy.require_approval_max_score",
      {
        min: 0,
        max: 100,
      },
    );

  if (
    !(
      continueMaxScore <
        reduceLimitMaxScore &&
      reduceLimitMaxScore <
        requireApprovalMaxScore
    )
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "Risk Gate policy score thresholds must be strictly increasing",
    );
  }

  const minimumConfidence =
    finiteNumber(
      value
        .minimum_confidence_for_auto_continue,
      "policy.minimum_confidence_for_auto_continue",
      {
        min: 0,
        max: 1,
      },
    );

  const requireCommercialVerification =
    requiredBoolean(
      value
        .require_commercial_verification_for_continue,
      "policy.require_commercial_verification_for_continue",
    );

  const maxPositiveDelta =
    optionalFiniteNumber(
      value
        .max_positive_delta_for_auto_continue,
      "policy.max_positive_delta_for_auto_continue",
      {
        min: 0,
        max: 100,
      },
    );

  let hardStops:
    RiskGatePolicy[
      "hard_stop_driver_contributions"
    ];

  if (
    value
      .hard_stop_driver_contributions !==
      undefined
  ) {
    if (
      !isRecord(
        value
          .hard_stop_driver_contributions,
      )
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "policy.hard_stop_driver_contributions must be an object",
      );
    }

    const parsedStops:
      Record<string, number> = {};

    for (
      const [
        driver,
        threshold,
      ] of Object.entries(
        value
          .hard_stop_driver_contributions,
      )
    ) {
      if (
        !RISK_DRIVER_NAMES.has(
          driver,
        )
      ) {
        throw new RiskGateApiError(
          400,
          "INVALID_REQUEST",
          `Unsupported hard-stop risk driver: ${driver}`,
        );
      }

      parsedStops[driver] =
        finiteNumber(
          threshold,
          `policy.hard_stop_driver_contributions.${driver}`,
          {
            min: 0,
            max: 100,
          },
        );
    }

    hardStops =
      parsedStops as
        RiskGatePolicy[
          "hard_stop_driver_contributions"
        ];
  }

  return {
    policy_id:
      policyId,

    policy_version:
      policyVersion,

    continue_max_score:
      continueMaxScore,

    reduce_limit_max_score:
      reduceLimitMaxScore,

    require_approval_max_score:
      requireApprovalMaxScore,

    minimum_confidence_for_auto_continue:
      minimumConfidence,

    require_commercial_verification_for_continue:
      requireCommercialVerification,

    hard_stop_driver_contributions:
      hardStops,

    max_positive_delta_for_auto_continue:
      maxPositiveDelta,
  };
}


function parseLiveEvaluationTime(
  value: unknown,
  now: Date,
): string | undefined {
  if (
    value === undefined
  ) {
    return undefined;
  }

  const raw =
    requiredString(
      value,
      "evaluated_at",
      64,
    );

  const timestamp =
    new Date(raw);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    throw new RiskGateApiError(
      400,
      "INVALID_REQUEST",
      "evaluated_at must be a valid timestamp",
    );
  }

  if (
    !Number.isFinite(
      now.getTime(),
    )
  ) {
    throw new Error(
      "Invalid server evaluation clock",
    );
  }

  const skew =
    Math.abs(
      timestamp.getTime() -
      now.getTime(),
    );

  if (
    skew >
    RISK_GATE_MAX_EVALUATION_CLOCK_SKEW_MS
  ) {
    throw new RiskGateApiError(
      400,
      "EVALUATION_TIME_OUT_OF_RANGE",
      "evaluated_at must be within 5 minutes of server time for live pre-flight requests",
    );
  }

  return timestamp.toISOString();
}


export function
parseExternalRiskGateBody(
  value: unknown,
  now = new Date(),
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

  const parseIso3 = (
    raw: unknown,
    field: string,
  ) => {
    const iso3 =
      requiredString(
        raw,
        field,
        3,
      ).toUpperCase();

    if (
      !/^[A-Z]{3}$/.test(
        iso3,
      )
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        `${field} must be ISO3 format`,
      );
    }

    return iso3;
  };

  let parsedSubject:
    | {
        subject_type:
          "country";

        subject_id:
          string;

        country_iso3:
          string;
      }
    | {
        subject_type:
          "corridor";

        subject_id:
          string;

        origin_country_iso3:
          string;

        destination_country_iso3:
          string;
      };

  /*
   * Legacy country form remains supported:
   *
   * { "country_iso3": "USA" }
   *
   * Subject-aware country/corridor forms are the
   * forward interface.
   */
  if (
    value.subject !==
      undefined
  ) {
    if (
      value.country_iso3 !==
      undefined
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "Provide either country_iso3 or subject, not both",
      );
    }

    if (
      !isRecord(
        value.subject,
      )
    ) {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "subject must be an object",
      );
    }

    const subject =
      value.subject;

    const type =
      requiredString(
        subject.type,
        "subject.type",
        32,
      ).toLowerCase();

    if (
      type === "country"
    ) {
      const iso3 =
        parseIso3(
          subject.country_iso3,
          "subject.country_iso3",
        );

      parsedSubject = {
        subject_type:
          "country",

        subject_id:
          iso3,

        country_iso3:
          iso3,
      };
    } else if (
      type === "corridor"
    ) {
      const origin =
        parseIso3(
          subject
            .origin_country_iso3,
          "subject.origin_country_iso3",
        );

      const destination =
        parseIso3(
          subject
            .destination_country_iso3,
          "subject.destination_country_iso3",
        );

      if (
        origin ===
        destination
      ) {
        throw new RiskGateApiError(
          400,
          "INVALID_REQUEST",
          "Corridor origin and destination must be different countries",
        );
      }

      parsedSubject = {
        subject_type:
          "corridor",

        subject_id:
          `${origin}>${destination}`,

        origin_country_iso3:
          origin,

        destination_country_iso3:
          destination,
      };
    } else {
      throw new RiskGateApiError(
        400,
        "INVALID_REQUEST",
        "subject.type must be country or corridor",
      );
    }
  } else {
    const iso3 =
      parseIso3(
        value.country_iso3,
        "country_iso3",
      );

    parsedSubject = {
      subject_type:
        "country",

      subject_id:
        iso3,

      country_iso3:
        iso3,
    };
  }

  const evaluatedAt =
    parseLiveEvaluationTime(
      value.evaluated_at,
      now,
    );

  let actionContext:
    ExternalRiskGateActionContext |
    undefined;

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

  const policy =
    parseExternalPolicy(
      value.policy,
    );

  return {
    ...parsedSubject,

    request_id:
      requestId,

    evaluated_at:
      evaluatedAt,

    action_context:
      actionContext,

    policy,
  } as ExternalRiskGateBody;
}


/**
 * Parse an authenticated live-preflight JSON body with an
 * actual byte cap. The Content-Length check is only an early
 * rejection; the post-read byte-length check also covers
 * chunked/missing Content-Length requests.
 */
export async function
readExternalRiskGateJsonBody(
  request: Request,
): Promise<unknown> {
  const declaredLength =
    request.headers.get(
      "content-length",
    );

  if (
    declaredLength &&
    /^\d+$/.test(
      declaredLength.trim(),
    ) &&
    Number(declaredLength) >
      RISK_GATE_MAX_REQUEST_BODY_BYTES
  ) {
    throw new RiskGateApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Risk Gate request body is too large",
    );
  }

  let bytes:
    ArrayBuffer;

  try {
    bytes =
      await request.arrayBuffer();
  } catch {
    throw new RiskGateApiError(
      400,
      "INVALID_BODY",
      "Risk Gate request body could not be read",
    );
  }

  if (
    bytes.byteLength >
    RISK_GATE_MAX_REQUEST_BODY_BYTES
  ) {
    throw new RiskGateApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Risk Gate request body is too large",
    );
  }

  const text =
    new TextDecoder()
      .decode(bytes);

  try {
    return JSON.parse(text);
  } catch {
    throw new RiskGateApiError(
      400,
      "INVALID_JSON",
      "Request body is not valid JSON",
    );
  }
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

  if (
    !Number.isInteger(
      client.requests_per_minute,
    ) ||
    client.requests_per_minute < 1 ||
    client.requests_per_minute > 10000
  ) {
    throw new RiskGateApiError(
      503,
      "CLIENT_CONFIGURATION_INVALID",
      "Risk Gate client configuration is invalid",
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

  if (
    typeof row.allowed !==
      "boolean" ||
    !Number.isFinite(
      row.request_count,
    ) ||
    !Number.isFinite(
      row.limit_count,
    ) ||
    typeof row.window_started_at !==
      "string"
  ) {
    throw new RiskGateApiError(
      503,
      "RATE_LIMIT_BACKEND_UNAVAILABLE",
      "Risk Gate rate limiter returned an invalid response",
    );
  }

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
      | "country"
      | "corridor"
      | "unknown";
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

    requestPayload =
      await readExternalRiskGateJsonBody(
        request,
      );

    parsed =
      parseExternalRiskGateBody(
        requestPayload,
      );

    const result =
      parsed.subject_type ===
        "corridor"
        ? await evaluateCorridorRiskGate({
            request_id:
              parsed.request_id,

            origin_country_iso3:
              parsed.origin_country_iso3,

            destination_country_iso3:
              parsed.destination_country_iso3,

            evaluated_at:
              parsed.evaluated_at,

            action_context:
              parsed.action_context,

            policy:
              parsed.policy,
          })
        : await evaluateCountryRiskGate({
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
          });

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
          parsed.subject_type,

        subject_id:
          parsed.subject_id,

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

        const auditSubject:
          {
            subject_type:
              | "country"
              | "corridor"
              | "unknown";

            subject_id:
              string;
          } =
          parsed
            ? {
                subject_type:
                  parsed.subject_type,

                subject_id:
                  parsed.subject_id,
              }
            : {
                subject_type:
                  "unknown",

                subject_id:
                  "UNKNOWN",
              };

        await persistAudit({
          client_id:
            clientId,

          request_id:
            requestId,

          subject_type:
            auditSubject
              .subject_type,

          subject_id:
            auditSubject
              .subject_id,

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

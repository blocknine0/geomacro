import { createHash, randomUUID } from "node:crypto";
import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { z, ZodError } from "zod";

import {
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "../../../src/lib/commercial-access-contract";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
} from "../../../src/lib/commercial-access.server";
import {
  structuredDeliveryPolicy,
} from "../../../src/lib/structured-data-entitlement-registry";
import {
  loadStructuralContext,
  type StructuralContext,
  type StructuralObservation,
} from "../../../src/lib/structural-context.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const structuralCapabilitySchema = z.enum([
  "structural_country_digest",
  "structural_corridor_digest",
  "structural_country_profile",
  "structural_corridor_profile",
]);

const countrySubjectSchema = z.object({
  type: z.literal("country"),
  country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/),
});

const corridorSubjectSchema = z.object({
  type: z.literal("corridor"),
  origin_country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/),
  destination_country_iso3: z.string().trim().regex(/^[A-Za-z]{3}$/),
});

const requestSchema = z.object({
  request_id: z.string().trim().min(8).max(160),
  capability: structuralCapabilitySchema,
  subject: z.discriminatedUnion("type", [countrySubjectSchema, corridorSubjectSchema]),
});

type StructuralCapability = z.infer<typeof structuralCapabilitySchema>;

function publicObservation(row: StructuralObservation) {
  return {
    observation_id: row.observation_id,
    source_id: row.source_id,
    source_record_id: row.source_record_id,
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    partner_country_iso3: row.partner_country_iso3,
    observed_at: row.observed_at,
    published_at: row.published_at,
    metric: row.metric,
    value_numeric: row.value_numeric,
    value_text: row.value_text,
    unit: row.unit,
    event_type: row.event_type,
    signal_type: row.signal_type,
    parser_version: row.parser_version,
    methodology_status: row.methodology_status,
    quality_status: row.quality_status,
    normalized_hash: row.normalized_hash,
    retrieved_at: row.retrieved_at,
  };
}

function commercialPayload(
  context: StructuralContext,
  capability: StructuralCapability,
  observationLimit: number,
  evidenceLimit: number,
) {
  const digest = capability.endsWith("_digest");
  const effectiveObservationLimit = digest
    ? Math.min(3, observationLimit)
    : observationLimit;
  const observations = context.observations
    .slice(0, effectiveObservationLimit)
    .map(publicObservation);

  const coverage = context.metadata.coverage.map((row) => ({
    source_id: row.source_id,
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    coverage_year: row.coverage_year,
    coverage_status: row.coverage_status,
    observation_count: row.observation_count,
    latest_observed_at: row.latest_observed_at,
    updated_at: row.updated_at,
  }));

  return {
    status: context.status,
    methodology_status: context.methodology_status,
    subject: context.subject,
    observations,
    coverage: coverage.slice(0, evidenceLimit),
    serving: {
      layer: context.metadata.serving_layer,
      warehouse_methodology_status: context.metadata.warehouse_methodology_status,
      composition_method: context.metadata.composition_method,
      route_modeling_status: context.metadata.route_modeling_status,
      direct_evidence_status: context.metadata.direct_evidence_status,
    },
    note: context.note,
  };
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertCapabilityMatchesSubject(
  capability: StructuralCapability,
  subjectType: "country" | "corridor",
) {
  const expectsCountry = capability.includes("country");
  if ((expectsCountry && subjectType !== "country") || (!expectsCountry && subjectType !== "corridor")) {
    throw new CommercialAccessError(
      400,
      "CAPABILITY_SUBJECT_MISMATCH",
      "The requested structural capability does not match the supplied subject type.",
    );
  }
}

function errorPayload(error: unknown) {
  if (error instanceof CommercialAccessError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
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
          code: "INVALID_COMMERCIAL_REQUEST",
          message: "Commercial structural request fields are invalid.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          execution_authorized: false,
        },
      },
    };
  }

  console.error("[commercial-structural] request failed", error);
  return {
    status: 503,
    body: {
      ok: false,
      error: {
        code: "COMMERCIAL_STRUCTURAL_UNAVAILABLE",
        message: "Commercial structural intelligence is temporarily unavailable.",
      },
      boundaries: {
        raw_data_included: false,
        private_warehouse_access: false,
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
    const authRequest = new Request("https://geomacro.local/api/commercial/structural", {
      headers: { authorization },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    const input = requestSchema.parse(raw);
    assertCapabilityMatchesSubject(input.capability, input.subject.type);

    const entitlement = await resolveCommercialEntitlementForCapability({
      principal,
      capability: input.capability as GeomacroCreditCapability,
    });
    const tier = entitlement.tier;
    const policy = structuredDeliveryPolicy(
      tier,
      input.capability as GeomacroCreditCapability,
    );
    if (!policy.allowed || !entitlement.policy.allowed) {
      throw new CommercialAccessError(
        403,
        "CAPABILITY_NOT_INCLUDED",
        "The requested capability is not included in this Geomacro commercial API entitlement.",
      );
    }
    if (!policy.product.subject_types.includes(input.subject.type)) {
      throw new CommercialAccessError(
        400,
        "CAPABILITY_SUBJECT_MISMATCH",
        "The requested capability does not support this subject type.",
      );
    }

    const context = await loadStructuralContext(input.subject);

    if (context.status === "NOT_CONFIGURED") {
      throw new CommercialAccessError(
        503,
        "STRUCTURAL_DATA_NOT_CONFIGURED",
        "Governed structural data is not configured in this runtime.",
      );
    }
    if (context.status === "UNAVAILABLE") {
      throw new CommercialAccessError(
        404,
        "STRUCTURAL_DATA_UNAVAILABLE",
        "No commercially eligible structural evidence is available for this subject.",
      );
    }

    await ensureCommercialCreditAccount({ principal, tier });
    const usage = await consumeCommercialCapability({
      principal,
      entitlement,
      requestId: input.request_id,
      capability: input.capability as GeomacroCreditCapability,
    });

    const data = commercialPayload(
      context,
      input.capability,
      policy.tier.max_structural_observations,
      policy.tier.max_evidence_references,
    );
    setResponseStatus(event, 200);

    return {
      ok: true,
      request_id: input.request_id,
      delivery_id: randomUUID(),
      principal: {
        key_id: principal.key_id,
        type: principal.principal_type,
      },
      entitlement: {
        grant_id: entitlement.grant_id,
        offer_id: entitlement.policy.offer_id,
        entitlement_kind: entitlement.policy.entitlement_kind,
        registry_version: policy.registry_version,
        credit_contract_version: policy.credit_contract_version,
        tier,
        capability: input.capability,
        credit_cost: usage.credit_cost ?? GEOMACRO_CREDIT_COSTS[input.capability],
        credits_remaining: usage.credits_remaining ?? null,
        period_ends_at: usage.period_ends_at ?? null,
        idempotent_replay: usage.idempotent_replay ?? false,
        history_mode: policy.tier.history_mode,
        export_mode: policy.tier.export_mode,
      },
      data,
      audit: {
        response_sha256: sha256Json(data),
        generated_at: new Date().toISOString(),
      },
      boundaries: {
        raw_data_included: policy.product.raw_data_included,
        private_warehouse_access: policy.product.private_warehouse_access,
        structured_delivery_only: true,
        execution_authorized: policy.product.execution_authorized,
        structural_data_is_gri_v1_2_input:
          policy.product.structural_data_is_gri_v1_2_input,
      },
    };
  } catch (error) {
    const failure = errorPayload(error);
    setResponseStatus(event, failure.status);
    return failure.body;
  }
});

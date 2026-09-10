import { createHash, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { z, ZodError } from "zod";
import {
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "../lib/commercial-access-contract";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementTier,
} from "../lib/commercial-access.server";
import {
  loadStructuralContext,
  type StructuralContext,
  type StructuralObservation,
} from "../lib/structural-context.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
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

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new CommercialAccessError(415, "CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new CommercialAccessError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new CommercialAccessError(413, "REQUEST_TOO_LARGE", "Request body is too large.");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CommercialAccessError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
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

function commercialPayload(context: StructuralContext, capability: StructuralCapability) {
  const digest = capability.endsWith("_digest");
  const observationLimit = digest ? 3 : 12;
  const observations = context.observations.slice(0, observationLimit).map(publicObservation);

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
    coverage: digest ? coverage.slice(0, 8) : coverage,
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

function errorResponse(error: unknown) {
  if (error instanceof CommercialAccessError) {
    return json(
      {
        ok: false,
        error: { code: error.code, message: error.message },
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          execution_authorized: false,
        },
      },
      error.status,
    );
  }

  if (error instanceof ZodError) {
    return json(
      {
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
      400,
    );
  }

  console.error("[commercial-structural] request failed", error);
  return json(
    {
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
    503,
  );
}

export const Route = createFileRoute("/api/commercial/structural")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const principal = await authenticateCommercialApiRequest(request);
          const input = requestSchema.parse(await parseJsonBody(request));
          assertCapabilityMatchesSubject(input.capability, input.subject.type);

          const tier = await resolveCommercialEntitlementTier(principal);
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
            tier,
            requestId: input.request_id,
            capability: input.capability as GeomacroCreditCapability,
          });

          const data = commercialPayload(context, input.capability);
          const deliveryId = randomUUID();

          return json({
            ok: true,
            request_id: input.request_id,
            delivery_id: deliveryId,
            principal: {
              key_id: principal.key_id,
              type: principal.principal_type,
            },
            entitlement: {
              tier,
              capability: input.capability,
              credit_cost: usage.credit_cost ?? GEOMACRO_CREDIT_COSTS[input.capability],
              credits_remaining: usage.credits_remaining ?? null,
              period_ends_at: usage.period_ends_at ?? null,
              idempotent_replay: usage.idempotent_replay ?? false,
            },
            data,
            audit: {
              response_sha256: sha256Json(data),
              generated_at: new Date().toISOString(),
            },
            boundaries: {
              raw_data_included: false,
              private_warehouse_access: false,
              structured_delivery_only: true,
              execution_authorized: false,
              structural_data_is_gri_v1_2_input: false,
            },
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});

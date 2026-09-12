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
import { recordCommercialUsageEvent } from "../../../src/lib/commercial-ops.server";
import { requireRiskSupabase } from "../../../src/lib/risk-supabase.server";
import {
  structuredDeliveryPolicy,
} from "../../../src/lib/structured-data-entitlement-registry";
import {
  loadStructuralContext,
  type StructuralContext,
  type StructuralObservation,
} from "../../../src/lib/structural-context.server";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_PRICING_VERSION,
  testnetApiCallPriceAtomic,
  testnetApiCallPriceUsdc,
} from "../../../src/lib/testnet-api-pricing";
import {
  TESTNET_USDC_ACCESS_CHAINS,
  requireTestnetUsdcReceiver,
} from "../../../src/lib/testnet-usdc-access-contract";
import { verifyTestnetUsdcPayment } from "../../../src/lib/testnet-usdc-payment-verification.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
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

const paymentProofSchema = z.object({
  chain_key: z.string().trim().min(3).max(40),
  tx_hash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/),
  payer_address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/),
});

const requestSchema = z.object({
  request_id: z.string().trim().min(8).max(160),
  capability: structuralCapabilitySchema,
  subject: z.discriminatedUnion("type", [countrySubjectSchema, corridorSubjectSchema]),
  payment: paymentProofSchema.optional(),
});

type StructuralCapability = z.infer<typeof structuralCapabilitySchema>;
type StructuralSubject = z.infer<typeof requestSchema>["subject"];

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
  const effectiveObservationLimit = digest ? Math.min(3, observationLimit) : observationLimit;
  const observations = context.observations.slice(0, effectiveObservationLimit).map(publicObservation);
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

function sha256Text(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function subjectKey(subject: StructuralSubject) {
  return subject.type === "country"
    ? subject.country_iso3.toUpperCase()
    : `${subject.origin_country_iso3.toUpperCase()}>${subject.destination_country_iso3.toUpperCase()}`;
}

function assertCapabilityMatchesSubject(capability: StructuralCapability, subjectType: "country" | "corridor") {
  const expectsCountry = capability.includes("country");
  if ((expectsCountry && subjectType !== "country") || (!expectsCountry && subjectType !== "corridor")) {
    throw new CommercialAccessError(400, "CAPABILITY_SUBJECT_MISMATCH", "The requested structural capability does not match the supplied subject type.");
  }
}

function errorPayload(error: unknown) {
  if (error instanceof CommercialAccessError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
        boundaries: { raw_data_included: false, private_warehouse_access: false, execution_authorized: false },
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
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        boundaries: { raw_data_included: false, private_warehouse_access: false, execution_authorized: false },
      },
    };
  }

  console.error("[commercial-structural] request failed", error);
  return {
    status: 503,
    body: {
      ok: false,
      error: { code: "COMMERCIAL_STRUCTURAL_UNAVAILABLE", message: "Commercial structural intelligence is temporarily unavailable." },
      boundaries: { raw_data_included: false, private_warehouse_access: false, execution_authorized: false },
    },
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);
  const startedAt = Date.now();

  try {
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new CommercialAccessError(415, "CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
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
    const authRequest = new Request("https://geomacro.local/api/commercial/structural", {
      headers: {
        authorization,
        "x-geomacro-api-key": apiKey,
        "x-geomacro-api-secret": apiSecret,
      },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    const input = requestSchema.parse(raw);
    assertCapabilityMatchesSubject(input.capability, input.subject.type);

    const entitlement = await resolveCommercialEntitlementForCapability({ principal, capability: input.capability as GeomacroCreditCapability });
    const tier = entitlement.tier;
    const policy = structuredDeliveryPolicy(tier, input.capability as GeomacroCreditCapability);
    if (!policy.allowed || !entitlement.policy.allowed) {
      throw new CommercialAccessError(403, "CAPABILITY_NOT_INCLUDED", "The requested capability is not included in this Geomacro commercial API entitlement.");
    }
    if (!policy.product.subject_types.includes(input.subject.type)) {
      throw new CommercialAccessError(400, "CAPABILITY_SUBJECT_MISMATCH", "The requested capability does not support this subject type.");
    }

    await ensureCommercialCreditAccount({ principal, tier });

    const context = await loadStructuralContext(input.subject);
    if (context.status === "NOT_CONFIGURED") {
      throw new CommercialAccessError(503, "STRUCTURAL_DATA_NOT_CONFIGURED", "Governed structural data is not configured in this runtime.");
    }
    if (context.status === "UNAVAILABLE") {
      throw new CommercialAccessError(404, "STRUCTURAL_DATA_UNAVAILABLE", "No commercially eligible structural evidence is available for this subject.");
    }

    let usage;
    let testnetPayment: Record<string, unknown> | null = null;

    if (tier === "testnet_tester") {
      const creditCost = GEOMACRO_CREDIT_COSTS[input.capability];
      const requiredAtomic = testnetApiCallPriceAtomic(creditCost);
      const quote = {
        payment_model: "pay_per_call",
        upfront_payment_required: false,
        asset: "USDC",
        environment: "testnet",
        credit_cost: creditCost,
        credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
        amount_due_usdc: testnetApiCallPriceUsdc(creditCost),
        amount_due_atomic: requiredAtomic.toString(),
        receiver_address: requireTestnetUsdcReceiver(),
        pricing_version: TESTNET_API_PRICING_VERSION,
        supported_chains: Object.values(TESTNET_USDC_ACCESS_CHAINS),
        commercial_revenue: false,
      } as const;

      if (!input.payment) {
        setResponseStatus(event, 402);
        return {
          ok: false,
          error: {
            code: "TESTNET_PAYMENT_REQUIRED",
            message: "Pay only for this API call, then retry the same request_id with the Testnet payment proof.",
          },
          payment: quote,
          boundaries: { raw_data_included: false, private_warehouse_access: false, execution_authorized: false },
        };
      }

      const payerAddress = input.payment.payer_address.toLowerCase();
      const verified = await verifyTestnetUsdcPayment({
        chain_key: input.payment.chain_key,
        tx_hash: input.payment.tx_hash,
        expected_payer: payerAddress,
        minimum_amount_atomic: requiredAtomic,
      });
      if (!verified.ok) {
        throw new CommercialAccessError(402, `TESTNET_${verified.code}`, "The Testnet USDC payment proof is not sufficient for this API call.");
      }

      const db = requireRiskSupabase();
      const profile = await db
        .from("testnet_tester_profiles")
        .select("access_status,wallet_address_hash")
        .eq("principal_id", principal.principal_id)
        .maybeSingle();
      if (profile.error) throw new CommercialAccessError(503, "TESTNET_PROFILE_UNAVAILABLE", "Testnet profile validation is temporarily unavailable.");
      if (!profile.data || profile.data.access_status !== "active") {
        throw new CommercialAccessError(403, "TESTNET_ACCESS_NOT_ACTIVE", "Testnet developer access is not active.");
      }
      if (profile.data.wallet_address_hash !== sha256Text(payerAddress)) {
        throw new CommercialAccessError(403, "TESTNET_PAYER_WALLET_MISMATCH", "The payer does not match the verified Testnet wallet.");
      }

      const existingRequest = await db
        .from("testnet_usdc_payment_claims")
        .select("id,tx_hash,capability,credit_cost,verification_status")
        .eq("principal_id", principal.principal_id)
        .eq("request_id", input.request_id)
        .maybeSingle();
      if (existingRequest.error) throw new CommercialAccessError(503, "TESTNET_PAYMENT_LEDGER_UNAVAILABLE", "Testnet payment ledger is temporarily unavailable.");

      if (existingRequest.data) {
        const sameProof =
          String(existingRequest.data.tx_hash).toLowerCase() === verified.tx_hash &&
          String(existingRequest.data.capability) === input.capability &&
          Number(existingRequest.data.credit_cost) === creditCost;
        if (!sameProof) {
          throw new CommercialAccessError(409, "TESTNET_PAYMENT_IDEMPOTENCY_CONFLICT", "This request_id is already bound to a different payment or capability.");
        }
      } else {
        const usedTx = await db
          .from("testnet_usdc_payment_claims")
          .select("id,request_id")
          .eq("chain_id", String(verified.chain_id))
          .eq("tx_hash", verified.tx_hash)
          .maybeSingle();
        if (usedTx.error) throw new CommercialAccessError(503, "TESTNET_PAYMENT_LEDGER_UNAVAILABLE", "Testnet payment ledger is temporarily unavailable.");
        if (usedTx.data) {
          throw new CommercialAccessError(409, "TESTNET_PAYMENT_ALREADY_CLAIMED", "This Testnet transaction has already been used for another API request.");
        }

        const claim = await db.from("testnet_usdc_payment_claims").insert({
          principal_id: principal.principal_id,
          chain_id: String(verified.chain_id),
          network_name: TESTNET_USDC_ACCESS_CHAINS[verified.chain_key].name,
          usdc_contract: verified.usdc_contract,
          tx_hash: verified.tx_hash,
          payer_address_hash: sha256Text(verified.payer_address),
          recipient_address_hash: sha256Text(verified.recipient_address),
          amount_atomic: verified.amount_atomic,
          amount_usdc: verified.amount_usdc,
          verification_status: "pending",
          request_id: input.request_id,
          capability: input.capability,
          credit_cost: creditCost,
          required_amount_atomic: requiredAtomic.toString(),
          pricing_version: TESTNET_API_PRICING_VERSION,
        });
        if (claim.error) {
          throw new CommercialAccessError(409, "TESTNET_PAYMENT_CLAIM_CONFLICT", "The Testnet payment proof could not be reserved for this API request.");
        }
      }

      try {
        usage = await consumeCommercialCapability({
          principal,
          entitlement,
          requestId: input.request_id,
          capability: input.capability as GeomacroCreditCapability,
        });
      } catch (error) {
        await db.from("testnet_usdc_payment_claims").update({
          verification_status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_code: error instanceof CommercialAccessError ? error.code : "USAGE_ACCOUNTING_FAILED",
        }).eq("principal_id", principal.principal_id).eq("request_id", input.request_id);
        throw error;
      }

      const finalize = await db.from("testnet_usdc_payment_claims").update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        rejected_at: null,
        rejection_code: null,
      }).eq("principal_id", principal.principal_id).eq("request_id", input.request_id);
      if (finalize.error) {
        throw new CommercialAccessError(503, "TESTNET_PAYMENT_FINALIZATION_FAILED", "Payment verification succeeded but the Testnet audit record could not be finalized.");
      }

      testnetPayment = {
        payment_model: "pay_per_call",
        chain_key: verified.chain_key,
        chain_id: verified.chain_id,
        tx_hash: verified.tx_hash,
        amount_paid_usdc: verified.amount_usdc,
        amount_due_usdc: quote.amount_due_usdc,
        credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
        pricing_version: TESTNET_API_PRICING_VERSION,
        commercial_revenue: false,
      };
    } else {
      usage = await consumeCommercialCapability({
        principal,
        entitlement,
        requestId: input.request_id,
        capability: input.capability as GeomacroCreditCapability,
      });
    }

    const data = commercialPayload(context, input.capability, policy.tier.max_structural_observations, policy.tier.max_evidence_references);
    const deliveryId = randomUUID();
    const responseHash = sha256Json(data);

    try {
      await recordCommercialUsageEvent({
        environment: tier === "testnet_tester" ? "testnet" : "internal",
        access_surface: "commercial_api",
        principal_id: principal.principal_id,
        principal_type: principal.principal_type,
        entitlement_grant_id: entitlement.grant_id,
        offer_id: entitlement.policy.offer_id,
        tier,
        registry_version: policy.registry_version,
        contract_version: policy.credit_contract_version,
        request_id: input.request_id,
        delivery_id: deliveryId,
        capability: input.capability,
        subject_type: input.subject.type,
        subject_key: subjectKey(input.subject),
        credits_charged: usage.idempotent_replay ? 0 : usage.credit_cost ?? GEOMACRO_CREDIT_COSTS[input.capability],
        credits_remaining: usage.credits_remaining ?? null,
        idempotent_replay: usage.idempotent_replay ?? false,
        http_status: 200,
        latency_ms: Date.now() - startedAt,
        success: true,
        response_sha256: responseHash,
        response_bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
        structural_observation_count: data.observations.length,
        evidence_reference_count: data.coverage.length,
        execution_authorized: false,
        shareable: true,
        metadata: testnetPayment ? { testnet_payment_model: "pay_per_call" } : {},
      });
    } catch (telemetryError) {
      console.error("[commercial-structural] operations ledger write failed", telemetryError);
    }

    setResponseStatus(event, 200);
    return {
      ok: true,
      request_id: input.request_id,
      delivery_id: deliveryId,
      principal: { key_id: principal.key_id, type: principal.principal_type },
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
      payment: testnetPayment,
      data,
      audit: { response_sha256: responseHash, generated_at: new Date().toISOString() },
      boundaries: {
        raw_data_included: policy.product.raw_data_included,
        private_warehouse_access: policy.product.private_warehouse_access,
        structured_delivery_only: true,
        execution_authorized: policy.product.execution_authorized,
        structural_data_is_gri_v1_2_input: policy.product.structural_data_is_gri_v1_2_input,
      },
    };
  } catch (error) {
    const failure = errorPayload(error);
    setResponseStatus(event, failure.status);
    return failure.body;
  }
});

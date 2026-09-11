import { createHash, randomUUID } from "node:crypto";

import {
  GEOMACRO_CREDIT_COSTS,
} from "./commercial-access-contract";
import {
  CommercialAccessError,
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { recordCommercialUsageEvent } from "./commercial-ops.server";
import { structuredDeliveryPolicy } from "./structured-data-entitlement-registry";
import { settleTestnetApiCall } from "./testnet-api-payment.server";
import { runCanonicalTestnetIntelligence } from "./testnet-intelligence-capability.server";
import type { TestnetIntelligenceRequest } from "./testnet-intelligence-contract";

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requestSubjectType(request: TestnetIntelligenceRequest) {
  if (request.capability === "intelligence_query") return "query" as const;
  if (request.capability === "gri_read") return "global" as const;
  return request.subject?.type ?? "global";
}

export type TestnetAccessSurface = "testnet_tester" | "commercial_api";

export type TestnetIntelligenceServiceResult =
  | {
      status: 402;
      body: {
        ok: false;
        error: { code: "TESTNET_PAYMENT_REQUIRED"; message: string };
        payment: ReturnType<typeof import("./testnet-api-payment.server").testnetApiPaymentQuote>;
        boundaries: {
          raw_data_included: false;
          private_warehouse_access: false;
          upstream_news_source_identity_exposed: false;
          execution_authorized: false;
        };
      };
    }
  | {
      status: 200;
      body: Record<string, unknown>;
    };

export async function deliverTestnetIntelligence(input: {
  principal: CommercialPrincipal;
  request: TestnetIntelligenceRequest;
  access_surface: TestnetAccessSurface;
}): Promise<TestnetIntelligenceServiceResult> {
  const { principal, request } = input;
  const entitlement = await resolveCommercialEntitlementForCapability({
    principal,
    capability: request.capability,
  });
  if (entitlement.tier !== "testnet_tester") {
    throw new CommercialAccessError(
      403,
      "TESTNET_TESTER_ENTITLEMENT_REQUIRED",
      "This endpoint is restricted to the Testnet tester entitlement.",
    );
  }

  const policy = structuredDeliveryPolicy(entitlement.tier, request.capability);
  if (!policy.allowed || !entitlement.policy.allowed) {
    throw new CommercialAccessError(
      403,
      "CAPABILITY_NOT_INCLUDED",
      "The requested capability is not included in the Testnet tester entitlement.",
    );
  }

  const subjectType = requestSubjectType(request);
  if (!policy.product.subject_types.includes(subjectType)) {
    throw new CommercialAccessError(
      400,
      "CAPABILITY_SUBJECT_MISMATCH",
      "The requested capability does not support this subject type.",
    );
  }

  const settlement = await settleTestnetApiCall({
    principal,
    entitlement,
    request_id: request.request_id,
    capability: request.capability,
    payment: request.payment,
  });

  if (settlement.status === "payment_required") {
    return {
      status: 402,
      body: {
        ok: false,
        error: {
          code: "TESTNET_PAYMENT_REQUIRED",
          message:
            "Pay only for this API call, then retry the same request_id with the Testnet payment proof.",
        },
        payment: settlement.quote,
        boundaries: {
          raw_data_included: false,
          private_warehouse_access: false,
          upstream_news_source_identity_exposed: false,
          execution_authorized: false,
        },
      },
    };
  }

  let delivery;
  try {
    delivery = await runCanonicalTestnetIntelligence({
      request,
      max_structural_observations: policy.tier.max_structural_observations,
      max_evidence_references: policy.tier.max_evidence_references,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_INTELLIGENCE_UNAVAILABLE";
    if (
      code === "STRUCTURAL_DATA_UNAVAILABLE" ||
      code === "SIGNED_RISK_OBJECT_UNAVAILABLE"
    ) {
      throw new CommercialAccessError(404, code, "Requested Testnet intelligence is unavailable for this subject.");
    }
    if (
      code === "STRUCTURAL_DATA_NOT_CONFIGURED" ||
      code === "SIGNED_RISK_OBJECT_NOT_VERIFIED" ||
      code.includes("Risk object") ||
      code.includes("risk object")
    ) {
      throw new CommercialAccessError(503, code.slice(0, 120), "Requested Testnet intelligence failed closed.");
    }
    if (code === "SUBJECT_REQUIRED") {
      throw new CommercialAccessError(400, code, "A compatible subject is required for this capability.");
    }
    throw error;
  }

  const deliveryId = randomUUID();
  const responseSha256 = sha256Json(delivery.data);
  const usage = settlement.usage;
  const creditCost = usage.credit_cost ?? GEOMACRO_CREDIT_COSTS[request.capability];

  let usageEventId: string | null = null;
  try {
    usageEventId = await recordCommercialUsageEvent({
      environment: "testnet",
      access_surface: input.access_surface as never,
      principal_id: principal.principal_id,
      principal_type: principal.principal_type,
      entitlement_grant_id: entitlement.grant_id,
      offer_id: entitlement.policy.offer_id,
      tier: entitlement.tier,
      registry_version: policy.registry_version,
      contract_version: policy.credit_contract_version,
      request_id: request.request_id,
      delivery_id: deliveryId,
      capability: request.capability,
      subject_type: delivery.subject_type,
      subject_key: delivery.subject_key,
      credits_charged: usage.idempotent_replay ? 0 : creditCost,
      credits_remaining: usage.credits_remaining ?? null,
      idempotent_replay: usage.idempotent_replay ?? false,
      http_status: 200,
      success: true,
      response_sha256: responseSha256,
      response_bytes: new TextEncoder().encode(JSON.stringify(delivery.data)).byteLength,
      structural_observation_count: delivery.structural_observation_count,
      evidence_reference_count: delivery.evidence_reference_count,
      execution_authorized: false,
      shareable: true,
      metadata: {
        tester_surface: input.access_surface,
        payment_model: "pay_per_call",
        quota_credits: 500,
      },
    });
  } catch (error) {
    console.error("[testnet-intelligence] operations ledger write failed", error);
  }

  return {
    status: 200,
    body: {
      ok: true,
      request_id: request.request_id,
      delivery_id: deliveryId,
      usage_event_id: usageEventId,
      principal: {
        key_id: principal.key_id,
        type: principal.principal_type,
      },
      entitlement: {
        grant_id: entitlement.grant_id,
        offer_id: entitlement.policy.offer_id,
        tier: entitlement.tier,
        capability: request.capability,
        credit_cost: creditCost,
        credits_remaining: usage.credits_remaining ?? null,
        period_ends_at: usage.period_ends_at ?? null,
        idempotent_replay: usage.idempotent_replay ?? false,
        quota_credits: 500,
      },
      payment: settlement.payment,
      data: delivery.data,
      audit: {
        response_sha256: responseSha256,
        generated_at: new Date().toISOString(),
      },
      boundaries: {
        raw_data_included: false,
        private_warehouse_access: false,
        upstream_news_source_identity_exposed: false,
        structured_delivery_only: true,
        execution_authorized: false,
      },
    },
  };
}

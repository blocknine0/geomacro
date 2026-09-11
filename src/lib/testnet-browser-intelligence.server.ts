import { createHash, randomUUID } from "node:crypto";

import {
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { GEOMACRO_CREDIT_COSTS } from "./commercial-access-contract";
import { recordCommercialUsageEvent } from "./commercial-ops.server";
import { structuredDeliveryPolicy } from "./structured-data-entitlement-registry";
import { loadStructuralContext } from "./structural-context.server";
import { loadTestnetLiveSeverity } from "./testnet-live-severity.server";

export type TestnetBrowserCapability =
  | "structural_country_digest"
  | "structural_corridor_digest"
  | "structural_country_profile"
  | "structural_corridor_profile";

export type TestnetBrowserSubject =
  | { type: "country"; country_iso3: string }
  | { type: "corridor"; origin_country_iso3: string; destination_country_iso3: string };

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runTestnetBrowserIntelligence(input: {
  principalId: string;
  requestId: string;
  capability: TestnetBrowserCapability;
  subject: TestnetBrowserSubject;
}) {
  const expectsCountry = input.capability.includes("country");
  if ((expectsCountry && input.subject.type !== "country") || (!expectsCountry && input.subject.type !== "corridor")) {
    throw new Error("CAPABILITY_SUBJECT_MISMATCH");
  }

  const principal: CommercialPrincipal = {
    principal_id: input.principalId,
    principal_type: "testnet_tester",
    principal_external_id: "browser_session",
    key_id: "tester_browser_session",
    scopes: ["testnet:structured"],
  };

  const entitlement = await resolveCommercialEntitlementForCapability({
    principal,
    capability: input.capability,
  });
  if (entitlement.tier !== "testnet_tester") throw new Error("TESTNET_TESTER_ENTITLEMENT_REQUIRED");

  const policy = structuredDeliveryPolicy(entitlement.tier, input.capability);
  const [context, severity] = await Promise.all([
    loadStructuralContext(input.subject),
    loadTestnetLiveSeverity(input.subject),
  ]);
  if (context.status === "NOT_CONFIGURED") throw new Error("STRUCTURAL_DATA_NOT_CONFIGURED");
  if (context.status === "UNAVAILABLE") throw new Error("STRUCTURAL_DATA_UNAVAILABLE");

  await ensureCommercialCreditAccount({ principal, tier: entitlement.tier });
  const usage = await consumeCommercialCapability({
    principal,
    entitlement,
    requestId: input.requestId,
    capability: input.capability,
  });

  const observationLimit = input.capability.endsWith("_digest")
    ? Math.min(3, policy.tier.max_structural_observations)
    : policy.tier.max_structural_observations;

  const data = {
    status: context.status,
    methodology_status: context.methodology_status,
    subject: context.subject,
    severity,
    observations: context.observations.slice(0, observationLimit).map((row) => ({
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
    })),
    coverage: context.metadata.coverage.slice(0, policy.tier.max_evidence_references),
    note: context.note,
  };

  const deliveryId = randomUUID();
  const responseSha256 = sha256Json(data);
  const usageEventId = await recordCommercialUsageEvent({
    environment: "testnet",
    access_surface: "testnet_tester" as never,
    principal_id: input.principalId,
    principal_type: "testnet_tester",
    entitlement_grant_id: entitlement.grant_id,
    offer_id: entitlement.policy.offer_id,
    tier: entitlement.tier,
    registry_version: policy.registry_version,
    contract_version: policy.credit_contract_version,
    request_id: input.requestId,
    delivery_id: deliveryId,
    capability: input.capability,
    subject_type: input.subject.type,
    subject_key: input.subject.type === "country"
      ? input.subject.country_iso3.toUpperCase()
      : `${input.subject.origin_country_iso3.toUpperCase()}>${input.subject.destination_country_iso3.toUpperCase()}`,
    credits_charged: usage.idempotent_replay ? 0 : GEOMACRO_CREDIT_COSTS[input.capability],
    credits_remaining: usage.credits_remaining ?? null,
    idempotent_replay: usage.idempotent_replay ?? false,
    http_status: 200,
    success: true,
    response_sha256: responseSha256,
    response_bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
    structural_observation_count: data.observations.length,
    evidence_reference_count: data.coverage.length,
    execution_authorized: false,
    shareable: true,
    metadata: {
      tester_surface: "browser",
      quota_credits: 500,
      latest_severity: severity.latest_severity,
      max_recent_severity: severity.max_recent_severity,
      severity_event_count: severity.events.length,
    },
  });

  return {
    request_id: input.requestId,
    delivery_id: deliveryId,
    usage_event_id: usageEventId,
    entitlement: {
      credit_cost: usage.credit_cost ?? GEOMACRO_CREDIT_COSTS[input.capability],
      credits_remaining: usage.credits_remaining ?? null,
      idempotent_replay: usage.idempotent_replay ?? false,
      quota_credits: 500,
    },
    data,
    audit: { response_sha256: responseSha256, generated_at: new Date().toISOString() },
    boundaries: {
      raw_data_included: false,
      private_warehouse_access: false,
      upstream_news_source_identity_exposed: false,
      execution_authorized: false,
    },
  } as const;
}

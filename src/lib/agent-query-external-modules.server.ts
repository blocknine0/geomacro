import { randomUUID } from "node:crypto";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";
import { publishCountryRiskObject } from "./country-risk-publisher.server";
import { resolveCountryGroAtOrBefore } from "./country-gro-resolver.server";
import { corridorSubjectId } from "./corridor-risk-engine";
import { publishCorridorRiskObject } from "./corridor-risk-publisher.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { loadAgentHotTopics } from "./agent-query-hot-topics.server";
import {
  getLatestCompatibleCorridorRiskObjectAtOrBefore,
} from "./risk-object-store.server";
import type { GeomacroRiskObject } from "./risk-object-contract";
import type { AgentQueryPlan } from "./agent-query-plan";

const LIVE_COUNTRY_SELF_HEAL_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function commerciallyDeliverable(object: GeomacroRiskObject | null, asOf: string) {
  if (!object) return null;
  return verifyCommercialRiskObjectArtifact(object, { now: new Date(asOf) }).deliverable
    ? object
    : null;
}

function liveSelfHealAllowed(asOf: string, now = new Date()) {
  const requested = Date.parse(asOf);
  if (!Number.isFinite(requested)) return false;
  return Math.abs(requested - now.getTime()) <= LIVE_COUNTRY_SELF_HEAL_MAX_CLOCK_SKEW_MS;
}

/**
 * Resolve the signed CANONICAL Risk Object used by adaptive agent queries.
 *
 * Country objects are cache-first. Supabase remains authoritative while it is
 * healthy; verified private B2 is used only on a primary read failure. The
 * former global refresh is quota-held on free-tier infrastructure, so a
 * current paid/live request may regenerate only its requested country when the
 * cached canonical object is absent/expired. Historical requests never mutate
 * production state: self-heal is allowed only inside a five-minute
 * server-clock window.
 *
 * Corridor objects remain endpoint-composed and the theoretical country-pair
 * universe is too large to pre-materialize safely. For a corridor request we
 * read the cache first and materialize only when no commercially deliverable
 * object exists.
 *
 * Publication remains fail-closed: missing signing configuration, missing or
 * ineligible evidence, invalid signatures, or persistence failures all return
 * null to the availability caller. No payment or execution is performed here.
 */
export async function loadCommercialRiskObjectForAgentQuery(
  subject: AgentQueryPlan["subjects"][number],
  asOf: string,
) {
  if (subject.type === "country") {
    const cached = commerciallyDeliverable(
      await resolveCountryGroAtOrBefore(subject.country_iso3, asOf),
      asOf,
    );
    if (cached) return cached;
    if (!liveSelfHealAllowed(asOf)) return null;

    try {
      const published = await publishCountryRiskObject({
        country_iso3: subject.country_iso3,
        as_of: asOf,
        delivery_profile: "CANONICAL",
      });
      return verifyCommercialRiskObjectArtifact(published.object, {
        now: new Date(asOf),
      }).deliverable
        ? published.object
        : null;
    } catch {
      return null;
    }
  }

  const corridorId = corridorSubjectId(
    subject.origin_country_iso3,
    subject.destination_country_iso3,
  );
  const cached = commerciallyDeliverable(
    await getLatestCompatibleCorridorRiskObjectAtOrBefore(corridorId, asOf),
    asOf,
  );
  if (cached) return cached;

  try {
    const published = await publishCorridorRiskObject({
      origin_country_iso3: subject.origin_country_iso3,
      destination_country_iso3: subject.destination_country_iso3,
      as_of: asOf,
      delivery_profile: "CANONICAL",
    });
    return verifyCommercialRiskObjectArtifact(published.object, {
      now: new Date(asOf),
    }).deliverable
      ? published.object
      : null;
  } catch {
    return null;
  }
}

function hasPreviousPublicationChange(object: NonNullable<Awaited<ReturnType<typeof loadCommercialRiskObjectForAgentQuery>>>) {
  return (
    typeof object.risk.previous_score === "number" &&
    Number.isFinite(object.risk.previous_score) &&
    typeof object.risk.delta === "number" &&
    Number.isFinite(object.risk.delta) &&
    Array.isArray(object.attribution) &&
    object.attribution.length > 0 &&
    object.attribution.every((row) =>
      typeof row.delta_contribution === "number" && Number.isFinite(row.delta_contribution)
    )
  );
}

export async function checkAgentQueryExternalModule(input: {
  module: string;
  subject: AgentQueryPlan["subjects"][number];
  plan: AgentQueryPlan;
}): Promise<boolean> {
  const asOf = input.plan.as_of ?? new Date().toISOString();

  if (input.module === "hot_topics") {
    try {
      const result = await loadAgentHotTopics({ plan: input.plan, subject: input.subject });
      return result.deliverable;
    } catch {
      return false;
    }
  }

  if (input.module === "gri_context") {
    try {
      const gri = await readPublicGlobalRisk();
      return Boolean(
        gri.snapshotId &&
        gri.snapshotAsOf &&
        gri.calculationHash &&
        gri.evidenceHash &&
        gri.verificationStatus === "VERIFIED",
      );
    } catch {
      return false;
    }
  }

  if (input.module === "signed_risk_object") {
    try {
      const object = await loadCommercialRiskObjectForAgentQuery(input.subject, asOf);
      if (!object) return false;
      if (input.plan.intent === "change_since") return hasPreviousPublicationChange(object);
      return true;
    } catch {
      return false;
    }
  }

  if (input.module === "risk_gate") {
    try {
      const context = input.plan.risk_gate_context;
      if (!context) return false;
      const object = await loadCommercialRiskObjectForAgentQuery(input.subject, asOf);
      if (!object) return false;
      const policy = demoPolicyFromPreset(context.policy_preset);
      const actionContext: { action_type: string; currency: "USDC"; amount?: number } = {
        action_type: context.action_type,
        currency: "USDC",
      };
      if (context.amount_usdc !== undefined) actionContext.amount = context.amount_usdc;
      const requestId = `availability:${randomUUID()}`;
      const result = input.subject.type === "country"
        ? await evaluateCountryRiskGate({
            request_id: requestId,
            country_iso3: input.subject.country_iso3,
            action_context: actionContext,
            policy,
            evaluated_at: asOf,
          })
        : await evaluateCorridorRiskGate({
            request_id: requestId,
            origin_country_iso3: input.subject.origin_country_iso3,
            destination_country_iso3: input.subject.destination_country_iso3,
            action_context: actionContext,
            policy,
            evaluated_at: asOf,
          });
      return result.context.execution_authorized === false;
    } catch {
      return false;
    }
  }

  return false;
}

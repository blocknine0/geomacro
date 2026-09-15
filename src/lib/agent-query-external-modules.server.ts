import { randomUUID } from "node:crypto";
import { verifyCommercialRiskObjectArtifact } from "./commercial-risk-object-policy";
import { corridorSubjectId } from "./corridor-risk-engine";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import {
  getLatestCompatibleCountryRiskObjectAtOrBefore,
  getLatestCompatibleCorridorRiskObjectAtOrBefore,
} from "./risk-object-store.server";
import type { AgentQueryPlan } from "./agent-query-plan";

async function loadCommercialRiskObject(
  subject: AgentQueryPlan["subjects"][number],
  asOf: string,
) {
  const object = subject.type === "country"
    ? await getLatestCompatibleCountryRiskObjectAtOrBefore(subject.country_iso3, asOf)
    : await getLatestCompatibleCorridorRiskObjectAtOrBefore(
        corridorSubjectId(subject.origin_country_iso3, subject.destination_country_iso3),
        asOf,
      );
  if (!object) return null;
  return verifyCommercialRiskObjectArtifact(object, { now: new Date(asOf) }).deliverable ? object : null;
}

export async function checkAgentQueryExternalModule(input: {
  module: string;
  subject: AgentQueryPlan["subjects"][number];
  plan: AgentQueryPlan;
}): Promise<boolean> {
  const asOf = input.plan.as_of ?? new Date().toISOString();

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
      return Boolean(await loadCommercialRiskObject(input.subject, asOf));
    } catch {
      return false;
    }
  }

  if (input.module === "risk_gate") {
    try {
      const object = await loadCommercialRiskObject(input.subject, asOf);
      if (!object) return false;
      const policy = demoPolicyFromPreset("balanced");
      const requestId = `availability:${randomUUID()}`;
      const result = input.subject.type === "country"
        ? await evaluateCountryRiskGate({
            request_id: requestId,
            country_iso3: input.subject.country_iso3,
            action_context: { action_type: "exposure_review", currency: "USDC" },
            policy,
            evaluated_at: asOf,
          })
        : await evaluateCorridorRiskGate({
            request_id: requestId,
            origin_country_iso3: input.subject.origin_country_iso3,
            destination_country_iso3: input.subject.destination_country_iso3,
            action_context: { action_type: "exposure_review", currency: "USDC" },
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

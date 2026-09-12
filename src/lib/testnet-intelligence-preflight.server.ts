import { corridorSubjectId } from "./corridor-risk-engine";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import {
  getLatestCompatibleCorridorRiskObject,
  getLatestCompatibleCountryRiskObject,
} from "./risk-object-store.server";
import { verifyPublicRiskObjectArtifact } from "./risk-object-verification.server";
import { loadStructuralContext } from "./structural-context.server";
import type {
  TestnetIntelligenceRequest,
  TestnetIntelligenceSubject,
} from "./testnet-intelligence-contract";

type ConcreteSubject = Exclude<TestnetIntelligenceSubject, { type: "global" }>;

function requireConcreteSubject(
  request: TestnetIntelligenceRequest,
): ConcreteSubject {
  const subject = request.subject;
  if (!subject || subject.type === "global") {
    throw new Error("SUBJECT_REQUIRED");
  }
  return subject;
}

async function requireStructuralAvailability(subject: ConcreteSubject) {
  const context = await loadStructuralContext(subject);
  if (context.status === "NOT_CONFIGURED") {
    throw new Error("STRUCTURAL_DATA_NOT_CONFIGURED");
  }
  if (context.status === "UNAVAILABLE") {
    throw new Error("STRUCTURAL_DATA_UNAVAILABLE");
  }
}

async function requireVerifiedRiskObject(subject: ConcreteSubject) {
  const object =
    subject.type === "country"
      ? await getLatestCompatibleCountryRiskObject(subject.country_iso3)
      : await getLatestCompatibleCorridorRiskObject(
          corridorSubjectId(
            subject.origin_country_iso3,
            subject.destination_country_iso3,
          ),
        );

  if (!object) throw new Error("SIGNED_RISK_OBJECT_UNAVAILABLE");

  const verification = verifyPublicRiskObjectArtifact(object);
  if (!verification.valid || !verification.cryptographic_valid) {
    throw new Error("SIGNED_RISK_OBJECT_NOT_VERIFIED");
  }
}

/**
 * Fail before issuing a Testnet payment quote when the requested paid
 * intelligence cannot currently be fulfilled from canonical state.
 *
 * This deliberately performs read-only prerequisite checks. It does not
 * consume credits, settle payment, authorize execution, or evaluate a Risk
 * Gate action.
 */
export async function preflightTestnetIntelligenceAvailability(
  request: TestnetIntelligenceRequest,
): Promise<void> {
  if (request.capability === "intelligence_query") return;

  if (request.capability === "gri_read") {
    await readPublicGlobalRisk();
    return;
  }

  const subject = requireConcreteSubject(request);

  if (request.capability.startsWith("structural_")) {
    await requireStructuralAvailability(subject);
    return;
  }

  if (request.capability === "signed_risk_object") {
    await requireVerifiedRiskObject(subject);
    return;
  }

  if (request.capability === "risk_gate_bundle") {
    await Promise.all([
      requireStructuralAvailability(subject),
      requireVerifiedRiskObject(subject),
      readPublicGlobalRisk(),
    ]);
  }
}

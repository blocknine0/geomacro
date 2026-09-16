import {
  normalizeEarlyWarningEventFamily,
  type EarlyWarningEventFamily,
} from "./early-warning-event-family";
import {
  persistEarlyWarningAlert,
  type EarlyWarningBuildInput,
} from "./early-warning-service.server";
import { assertEarlyWarningDerivedSourcesEligible } from "./early-warning-source-eligibility.server";

export type GovernedEarlyWarningSourceRef = {
  source_id: string;
  observation_id?: string | null;
};

export type GovernedEarlyWarningInput = {
  alert: EarlyWarningBuildInput;
  sources: GovernedEarlyWarningSourceRef[];
};

export function canonicalGovernedEventFamily(input: {
  event_family: string;
  visibility?: "public" | "private";
}): EarlyWarningEventFamily {
  const family = normalizeEarlyWarningEventFamily(input.event_family);
  if ((input.visibility ?? "private") === "public" && family === "other") {
    throw new Error("public Early Warning requires a classified canonical event family");
  }
  return family;
}

/**
 * Canonical source-governed persistence path for Early Warning.
 *
 * Watchers/adapters should use this function rather than writing the alert table
 * directly. It proves that every contributing source/observation is permitted
 * for derived commercial signals before any public/commercial alert is stored.
 */
export async function persistGovernedEarlyWarningAlert(
  input: GovernedEarlyWarningInput,
) {
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("governed Early Warning requires at least one source reference");
  }

  const sourceGate = await assertEarlyWarningDerivedSourcesEligible(input.sources);
  if (!sourceGate.eligible) {
    const reasons = sourceGate.ineligible
      .flatMap((item) => item.reason_codes.map((reason) => `${item.source_id || "unknown"}:${reason}`))
      .join(",");
    throw new Error(`Early Warning source gate failed: ${reasons || "UNKNOWN_SOURCE_POLICY_FAILURE"}`);
  }

  const eventFamily = canonicalGovernedEventFamily({
    event_family: input.alert.event_family,
    visibility: input.alert.visibility,
  });

  return persistEarlyWarningAlert({
    ...input.alert,
    event_family: eventFamily,
  });
}

import type { GeomacroRiskObject } from "./risk-object-contract";

export const RISK_OBJECT_OBSERVATION_FIELD = "observed_at" as const;

export type ObservationBoundRiskObject = GeomacroRiskObject & {
  /**
   * Timestamp at which the signed risk state was observed/evaluated.
   *
   * This field intentionally lives inside the canonical signed payload so a
   * stale object cannot be re-labelled as a fresh observation by changing an
   * unsigned HTTP header or wrapper field.
   */
  observed_at: string;
};

function canonicalTimestamp(value: string, field: string) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${field} must be a valid timestamp`);
  }

  return timestamp.toISOString();
}

/**
 * Bind an observation timestamp into the Risk Object before issuer signing.
 *
 * The observation cannot be later than generated_at.  Publishing code should
 * normally pass the same deterministic `as_of` boundary used for calculation.
 */
export function withRiskObjectObservationTimestamp(
  object: GeomacroRiskObject,
  observedAt: string,
): ObservationBoundRiskObject {
  const observed = canonicalTimestamp(observedAt, "Risk Object observed_at");
  const generated = canonicalTimestamp(object.generated_at, "Risk Object generated_at");

  if (Date.parse(observed) > Date.parse(generated)) {
    throw new Error("Risk Object observed_at cannot be after generated_at");
  }

  return {
    ...object,
    observed_at: observed,
  };
}

export function riskObjectObservedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const observedAt = (value as Record<string, unknown>)[RISK_OBJECT_OBSERVATION_FIELD];
  if (typeof observedAt !== "string" || !observedAt.trim()) {
    return null;
  }

  const parsed = Date.parse(observedAt);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

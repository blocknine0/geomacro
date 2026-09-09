/**
 * Current public Global Risk Index contract.
 *
 * Public surfaces read immutable persisted snapshots for this contract.
 * Historical deterministic engines remain separately versioned and are not
 * used to recalculate the current public score in the browser.
 */

export const GRI_METHOD_VERSION = "gri-v1.2.0";

export const LEGACY_GRI_PROOF_VERSION = "gri-proof-v1.1.0";
export const GRI_PROOF_VERSION = "gri-proof-v1.2.0";

export const SUPPORTED_GRI_PROOF_VERSIONS = [
  LEGACY_GRI_PROOF_VERSION,
  GRI_PROOF_VERSION,
] as const;

export function isSupportedGriProofVersion(
  value: unknown,
): value is (typeof SUPPORTED_GRI_PROOF_VERSIONS)[number] {
  return SUPPORTED_GRI_PROOF_VERSIONS.includes(
    value as (typeof SUPPORTED_GRI_PROOF_VERSIONS)[number],
  );
}

export const GRI_CLASSIFICATION_VERSION = "event-severity-v1.0.5";
export const GRI_CLASSIFICATION_PROMPT_VERSION = "risk-desk-filter-v1.0.5";

export const GRI_STORY_CORRELATION_VERSION = "story-correlation-v1.0.0";
export const GRI_STORY_CORRELATION_PROMPT_VERSION = "story-match-title-v1.0.0";

export const GRI_LOOKBACK_HOURS = 72;
export const GRI_HALF_LIFE_HOURS = 24;
// Public freshness policy. A verified current-method snapshot remains eligible
// for up to six hours; evidence-triggered publication can replace it earlier.
export const GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS = 6;

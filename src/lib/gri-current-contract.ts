/**
 * Current public Global Risk Index contract.
 *
 * Public surfaces read immutable persisted snapshots for this contract.
 * Historical deterministic engines remain separately versioned and are not
 * used to recalculate the current public score in the browser.
 */

export const GRI_METHOD_VERSION = "gri-v1.1.0";
export const GRI_PROOF_VERSION = "gri-proof-v1.1.0";

export const GRI_CLASSIFICATION_VERSION = "event-severity-v1.0.4";
export const GRI_CLASSIFICATION_PROMPT_VERSION = "risk-desk-filter-v1.0.4";

export const GRI_STORY_CORRELATION_VERSION = "story-correlation-v1.0.0";
export const GRI_STORY_CORRELATION_PROMPT_VERSION = "story-match-title-v1.0.0";

export const GRI_LOOKBACK_HOURS = 72;
export const GRI_HALF_LIFE_HOURS = 24;
export const GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS = 3;

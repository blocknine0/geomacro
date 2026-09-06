export const CURRENT_EVENT_PIPELINE_VERSION =
  "current-event-pipeline-v0.1.0" as const;


export type CurrentEventPipeline =
  | "CANONICAL_COUNTRY_RISK"
  | "LEGACY_EVENTS";


export const CURRENT_EVENT_PIPELINES = {
  CANONICAL_COUNTRY_RISK: {
    pipeline:
      "CANONICAL_COUNTRY_RISK",

    discovery_source_key:
      "gdelt_gal",

    evidence_store:
      "private_compressed_fragments",

    structured_store:
      "live_structured_events",

    scoring_consumers: [
      "GRO",
      "RISK_GATE",
    ],

    ask_consumer:
      false,
  },

  LEGACY_EVENTS: {
    pipeline:
      "LEGACY_EVENTS",

    discovery_source_key:
      "ingest-news",

    evidence_store:
      "events",

    structured_store:
      "events",

    scoring_consumers: [
      "GRI",
    ],

    ask_consumer:
      true,
  },
} as const;


/*
 * Important:
 *
 * gdelt_gal and gdelt_v2 currently belong to
 * different source registries / purposes.
 *
 * They must not be silently renamed or merged.
 */
export const GDELT_SOURCE_IDENTITIES = {
  canonical_live_stream:
    "gdelt_gal",

  governed_external_registry_candidate:
    "gdelt_v2",
} as const;

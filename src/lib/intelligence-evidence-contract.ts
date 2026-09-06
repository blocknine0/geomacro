import type {
  IntelligenceSourceClass,
} from "./intelligence-source-classification";


export const INTELLIGENCE_EVIDENCE_VERSION =
  "intelligence-evidence-v0.1.0" as const;


export type IntelligenceEvidence = {
  version:
    typeof INTELLIGENCE_EVIDENCE_VERSION;

  evidence_id:
    string;

  source_class:
    IntelligenceSourceClass;

  country_iso3:
    string | null;

  partner_country_iso3:
    string | null;

  domain:
    "GEOPOLITICS" |
    "MACRO" |
    "CRITICAL_MINERALS" |
    "CRYPTO" |
    "CROSS_DOMAIN";

  dimension:
    string;

  observed_at:
    string | null;

  published_at:
    string | null;

  retrieved_at:
    string;

  normalized_value:
    number | string | boolean | null;

  confidence:
    number;

  freshness_status:
    "CURRENT" |
    "AGING" |
    "STALE" |
    "UNKNOWN";

  source_reference:
    string | null;

  provenance_hash:
    string;

  evidence_hash:
    string;
};

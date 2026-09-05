/**
 * Geomacro commercial presentation boundary.
 *
 * Exact upstream source identities, direct source URLs,
 * raw third-party payloads and licence metadata are
 * internal provenance by default.
 *
 * Customer-facing products expose Geomacro structured
 * intelligence rather than a third-party source directory.
 */

export type PublicEvidenceSummary = {
  evidence_count:
    number;

  independent_source_count:
    number;

  confidence:
    number | null;

  freshness:
    string | null;

  provenance_available:
    boolean;
};

export type InternalEvidenceProvenance = {
  source_id:
    string;

  source_url:
    string | null;

  raw_hash:
    string;

  normalized_hash:
    string;

  licence:
    string | null;

  commercial_eligibility_status:
    string;
};

export function
toPublicEvidenceSummary(
  input: {
    evidence_count:
      number;

    independent_source_count:
      number;

    confidence?:
      number | null;

    freshness?:
      string | null;
  },
): PublicEvidenceSummary {
  return {
    evidence_count:
      input.evidence_count,

    independent_source_count:
      input
        .independent_source_count,

    confidence:
      input.confidence ??
      null,

    freshness:
      input.freshness ??
      null,

    provenance_available:
      true,
  };
}

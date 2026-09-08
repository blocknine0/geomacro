import { describe, expect, it } from "vitest";
import { buildSanctionsProgramEvidence } from "../lib/sanctions-evidence-contract";
import { mapSanctionsEvidenceToObservationInput } from "../lib/sanctions-observation-mapper";
import { transformUcdpDyadicRecord } from "../lib/ucdp-dyadic-contract";
import { mapUcdpDyadicEvidenceToObservationInput } from "../lib/ucdp-dyadic-observation-mapper";

describe("commercial source-policy status -> observation eligibility contract", () => {
  it("maps review-required sanctions evidence to persisted UNVERIFIED while preserving policy provenance", () => {
    const evidence = buildSanctionsProgramEvidence({
      source: "OFAC_SDN",
      program: "IRAN",
      designation_count: 674,
      retrieved_at: "2026-09-06T08:30:00.000Z",
      source_url:
        "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
    });

    const mapped = mapSanctionsEvidenceToObservationInput(evidence);
    expect(mapped.provenance.commercial_status).toBe("REVIEW_REQUIRED");
    expect(mapped.commercialEligibilityStatus).toBe("UNVERIFIED");
  });

  it("maps review-required UCDP dyadic evidence to persisted UNVERIFIED", () => {
    const raw = {
      dyad_id: 101,
      conflict_id: 77,
      location: "Example Interstate Conflict",
      side_a: "State A",
      side_a_id: 1,
      side_b: "State B",
      side_b_id: 2,
      year: 2025,
      type_of_conflict: 2,
      intensity_level: 2,
      start_date: "2025-01-01",
      start_date2: "2025-02-01",
      ep_end_date: null,
    };

    const transformed = transformUcdpDyadicRecord(raw);
    expect(transformed.status).toBe("ACCEPTED");
    if (transformed.status !== "ACCEPTED") {
      throw new Error("Expected accepted UCDP test record");
    }

    const mapped = mapUcdpDyadicEvidenceToObservationInput({
      evidence: transformed.evidence,
      raw,
      source_url: "https://ucdpapi.pcr.uu.se/api/dyadic/26.1",
    });

    expect(mapped.provenance.commercial_status).toBe("REVIEW_REQUIRED");
    expect(mapped.commercialEligibilityStatus).toBe("UNVERIFIED");
  });
});

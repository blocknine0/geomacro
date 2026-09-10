import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyCountryRiskCommercialEligibility,
} from "../lib/country-risk-commercial-eligibility";

import type {
  GeomacroRiskObject,
} from "../lib/risk-object-contract";


function baseObject(): GeomacroRiskObject {
  return {
    schema_version: "gro-1.1",
    object_id: "gro_country_USA_test",
    subject: {
      type: "country",
      id: "USA",
      name: "United States",
    },
    risk: {
      score: 30,
      label: "STABLE",
      previous_score: null,
      delta: null,
      direction: "unknown",
    },
    attribution: [],
    confidence: 0.9,
    evidence: [
      {
        event_id: "event-1",
        title: "Event 1",
        event_type: "macro",
        severity: 30,
        confidence: 90,
        direction: "steady",
        last_seen_at: "2026-09-10T03:00:00.000Z",
        evidence_count: 2,
        independent_source_count: 2,
        evidence_refs: [],
        source_families: [],
      },
    ],
    evidence_coverage: null,
    evidence_summary: {
      event_count: 1,
      evidence_count: 2,
      independent_source_count: 2,
    },
    methodology_version: "country-risk-v0.1.0-pilot",
    generated_at: "2026-09-10T03:30:00.000Z",
    expires_at: "2026-09-10T06:30:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "UNVERIFIED",
      reason_codes: [
        "commercial_source_eligibility_not_enforced",
      ],
    },
    verification: {
      status: "INCOMPLETE",
      reason_codes: [
        "commercial_source_eligibility_not_enforced",
      ],
      last_verified_at: null,
    },
    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash: "c".repeat(64),
      payload_hash: null,
      canonicalization: null,
      signature: null,
      signature_scheme: null,
      signing_key_id: null,
    },
    provenance: {
      structure_versions: [],
      scoring_versions: [],
      relevance_versions: [],
      country_versions: [],
      story_versions: [],
    },
  };
}


describe(
  "country GRO commercial eligibility",
  () => {
    it(
      "promotes when every used structured event is VERIFIED",
      () => {
        const result =
          applyCountryRiskCommercialEligibility(
            baseObject(),
            [
              {
                event_id: "event-1",
                status: "VERIFIED",
                reason_codes: [],
              },
            ],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("VERIFIED");
        expect(
          result.verification.status,
        ).toBe("VERIFIED");
        expect(
          result.verification.reason_codes,
        ).toEqual([]);
      },
    );

    it(
      "fails closed when event eligibility metadata is missing",
      () => {
        const result =
          applyCountryRiskCommercialEligibility(
            baseObject(),
            [],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("UNVERIFIED");
        expect(
          result.verification.status,
        ).toBe("INCOMPLETE");
        expect(
          result.verification.reason_codes,
        ).toContain(
          "missing_structured_event_commercial_eligibility",
        );
      },
    );

    it(
      "permits DERIVED_ONLY evidence for the derived GRO contract while retaining the no-raw restriction",
      () => {
        const result =
          applyCountryRiskCommercialEligibility(
            baseObject(),
            [
              {
                event_id: "event-1",
                status: "DERIVED_ONLY",
                reason_codes: [
                  "raw_redistribution_prohibited",
                ],
              },
            ],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("VERIFIED");
        expect(
          result.commercial_eligibility.reason_codes,
        ).toContain(
          "commercial_source_derived_only",
        );
        expect(
          result.commercial_eligibility.reason_codes,
        ).toContain(
          "derived_only_delivery_no_raw_redistribution",
        );
        expect(
          result.commercial_eligibility.reason_codes,
        ).toContain(
          "raw_redistribution_prohibited",
        );
        expect(
          result.verification.status,
        ).toBe("VERIFIED");
        expect(
          result.verification.reason_codes,
        ).toEqual([]);
      },
    );

    it(
      "allows a VERIFIED plus DERIVED_ONLY mixed evidence set",
      () => {
        const object = baseObject();
        object.evidence.push({
          ...object.evidence[0],
          event_id: "event-2",
          title: "Event 2",
        });

        const result =
          applyCountryRiskCommercialEligibility(
            object,
            [
              {
                event_id: "event-1",
                status: "VERIFIED",
                reason_codes: [],
              },
              {
                event_id: "event-2",
                status: "DERIVED_ONLY",
                reason_codes: [],
              },
            ],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("VERIFIED");
        expect(
          result.verification.status,
        ).toBe("VERIFIED");
      },
    );

    it(
      "does not let DERIVED_ONLY hide an UNVERIFIED source",
      () => {
        const object = baseObject();
        object.evidence.push({
          ...object.evidence[0],
          event_id: "event-2",
          title: "Event 2",
        });

        const result =
          applyCountryRiskCommercialEligibility(
            object,
            [
              {
                event_id: "event-1",
                status: "DERIVED_ONLY",
                reason_codes: [],
              },
              {
                event_id: "event-2",
                status: "UNVERIFIED",
                reason_codes: [
                  "commercial_source_review_required",
                ],
              },
            ],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("UNVERIFIED");
        expect(
          result.verification.status,
        ).toBe("INCOMPLETE");
        expect(
          result.verification.reason_codes,
        ).toContain(
          "commercial_source_review_required",
        );
      },
    );

    it(
      "marks the object INELIGIBLE when a used event is ineligible",
      () => {
        const result =
          applyCountryRiskCommercialEligibility(
            baseObject(),
            [
              {
                event_id: "event-1",
                status: "INELIGIBLE",
                reason_codes: [
                  "commercial_use_prohibited",
                ],
              },
            ],
          );

        expect(
          result.commercial_eligibility.status,
        ).toBe("INELIGIBLE");
        expect(
          result.verification.reason_codes,
        ).toContain(
          "commercial_source_ineligible",
        );
      },
    );
  },
);

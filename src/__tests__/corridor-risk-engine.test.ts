import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCorridorRiskObject,
} from "../lib/corridor-risk-engine";

import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_CANONICALIZATION_VERSION,
  GRO_SCHEMA_VERSION,
  GRO_SIGNATURE_SCHEME,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";


function country(
  iso3: string,
  score: number,
  confidence: number,
  verification:
    GeomacroRiskObject[
      "verification"
    ]["status"],
  commercial:
    GeomacroRiskObject[
      "commercial_eligibility"
    ]["status"],
): GeomacroRiskObject {
  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      `gro_country_${iso3}_test`,

    subject: {
      type: "country",
      id: iso3,
      name: null,
    },

    risk: {
      score,
      label:
        score >= 60
          ? "ELEVATED"
          : "WATCH",

      previous_score:
        null,

      delta:
        null,

      direction:
        "unknown",
    },

    attribution: [
      {
        driver:
          "conflict",

        score_contribution:
          score,

        delta_contribution:
          null,

        event_count:
          1,

        weight:
          1,
      },
    ],

    confidence,

    evidence: [
      {
        event_id:
          `event-${iso3}`,

        title:
          `${iso3} test event`,

        event_type:
          "conflict",

        severity:
          score,

        confidence:
          confidence * 100,

        direction:
          "unknown",

        last_seen_at:
          "2026-09-08T03:00:00.000Z",

        evidence_count:
          1,

        independent_source_count:
          1,

        evidence_refs: [
          `ref-${iso3}`,
        ],

        source_families: [
          `source-${iso3}`,
        ],
      },
    ],

    evidence_coverage:
      null,

    evidence_summary: {
      event_count:
        1,

      evidence_count:
        1,

      independent_source_count:
        1,
    },

    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,

    generated_at:
      "2026-09-08T03:00:00.000Z",

    expires_at:
      "2026-09-08T06:00:00.000Z",

    issuer:
      "Geomacro",

    commercial_eligibility: {
      status:
        commercial,

      reason_codes:
        commercial ===
        "VERIFIED"
          ? []
          : [
              "test_unverified",
            ],
    },

    verification: {
      status:
        verification,

      reason_codes:
        verification ===
        "VERIFIED"
          ? []
          : [
              "test_incomplete",
            ],

      last_verified_at:
        null,
    },

    integrity: {
      input_hash:
        "1".repeat(64),

      data_hash:
        "2".repeat(64),

      calculation_hash:
        `${iso3.charCodeAt(0)}`.padEnd(
          64,
          "3",
        ),

      payload_hash:
        "4".repeat(64),

      canonicalization:
        GRO_CANONICALIZATION_VERSION,

      signature:
        "test-signature",

      signature_scheme:
        GRO_SIGNATURE_SCHEME,

      signing_key_id:
        "test-key",
    },

    provenance: {
      structure_versions: [
        "structure-test",
      ],

      scoring_versions: [
        "score-test",
      ],

      relevance_versions: [
        "relevance-test",
      ],

      country_versions: [
        "country-test",
      ],

      story_versions: [
        "story-test",
      ],
    },
  };
}


describe(
  "corridor endpoint composition",
  () => {
    it(
      "uses the higher endpoint score and lower confidence",
      async () => {
        const object =
          await buildCorridorRiskObject({
            origin_country_iso3:
              "USA",

            destination_country_iso3:
              "CHN",

            origin:
              country(
                "USA",
                64,
                0.54,
                "INCOMPLETE",
                "UNVERIFIED",
              ),

            destination:
              country(
                "CHN",
                60,
                0.62,
                "VERIFIED",
                "VERIFIED",
              ),

            as_of:
              "2026-09-08T04:00:00.000Z",
          });

        expect(
          object.subject,
        ).toMatchObject({
          type:
            "corridor",

          id:
            "USA>CHN",
        });

        expect(
          object.risk.score,
        ).toBe(64);

        expect(
          object.confidence,
        ).toBe(0.54);

        expect(
          object
            .corridor_context
            ?.dominant_endpoint,
        ).toBe(
          "origin",
        );

        expect(
          object
            .verification
            .status,
        ).toBe(
          "INCOMPLETE",
        );

        expect(
          object
            .commercial_eligibility
            .status,
        ).toBe(
          "UNVERIFIED",
        );

        expect(
          object
            .evidence_summary
            .event_count,
        ).toBe(2);
      },
    );

    it(
      "preserves directional corridor identity",
      async () => {
        const usa =
          country(
            "USA",
            64,
            0.54,
            "VERIFIED",
            "VERIFIED",
          );

        const chn =
          country(
            "CHN",
            60,
            0.62,
            "VERIFIED",
            "VERIFIED",
          );

        const forward =
          await buildCorridorRiskObject({
            origin_country_iso3:
              "USA",

            destination_country_iso3:
              "CHN",

            origin:
              usa,

            destination:
              chn,

            as_of:
              "2026-09-08T04:00:00.000Z",
          });

        const reverse =
          await buildCorridorRiskObject({
            origin_country_iso3:
              "CHN",

            destination_country_iso3:
              "USA",

            origin:
              chn,

            destination:
              usa,

            as_of:
              "2026-09-08T04:00:00.000Z",
          });

        expect(
          forward.subject.id,
        ).toBe(
          "USA>CHN",
        );

        expect(
          reverse.subject.id,
        ).toBe(
          "CHN>USA",
        );

        expect(
          forward.object_id,
        ).not.toBe(
          reverse.object_id,
        );
      },
    );

    it(
      "computes delta against a compatible previous corridor object",
      async () => {
        const previous =
          await buildCorridorRiskObject({
            origin_country_iso3:
              "USA",

            destination_country_iso3:
              "CHN",

            origin:
              country(
                "USA",
                50,
                0.8,
                "VERIFIED",
                "VERIFIED",
              ),

            destination:
              country(
                "CHN",
                45,
                0.8,
                "VERIFIED",
                "VERIFIED",
              ),

            as_of:
              "2026-09-08T03:00:00.000Z",
          });

        const current =
          await buildCorridorRiskObject({
            origin_country_iso3:
              "USA",

            destination_country_iso3:
              "CHN",

            origin:
              country(
                "USA",
                64,
                0.8,
                "VERIFIED",
                "VERIFIED",
              ),

            destination:
              country(
                "CHN",
                60,
                0.8,
                "VERIFIED",
                "VERIFIED",
              ),

            previous,

            as_of:
              "2026-09-08T04:00:00.000Z",
          });

        expect(
          current
            .risk
            .previous_score,
        ).toBe(50);

        expect(
          current
            .risk
            .delta,
        ).toBe(14);

        expect(
          current
            .risk
            .direction,
        ).toBe(
          "escalating",
        );
      },
    );
  },
);

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseExternalRiskGateBody,
} from "../lib/risk-gate-api.server";


const policy = {
  policy_id:
    "api-parser-test",

  policy_version:
    "1.0",
};


describe(
  "Risk Gate external API parser",
  () => {
    it(
      "preserves legacy country_iso3 requests",
      () => {
        const parsed =
          parseExternalRiskGateBody({
            request_id:
              "legacy-country",

            country_iso3:
              "usa",

            policy,
          });

        expect(parsed)
          .toMatchObject({
            request_id:
              "legacy-country",

            subject_type:
              "country",

            subject_id:
              "USA",

            country_iso3:
              "USA",
          });
      },
    );


    it(
      "accepts subject-aware country requests",
      () => {
        const parsed =
          parseExternalRiskGateBody({
            request_id:
              "subject-country",

            subject: {
              type:
                "country",

              country_iso3:
                "chn",
            },

            policy,
          });

        expect(parsed)
          .toMatchObject({
            subject_type:
              "country",

            subject_id:
              "CHN",

            country_iso3:
              "CHN",
          });
      },
    );


    it(
      "accepts directional corridor requests",
      () => {
        const parsed =
          parseExternalRiskGateBody({
            request_id:
              "corridor-usa-chn",

            subject: {
              type:
                "corridor",

              origin_country_iso3:
                "usa",

              destination_country_iso3:
                "chn",
            },

            action_context: {
              action_type:
                "cross_border_payment",

              amount:
                10000,

              currency:
                "USDC",
            },

            policy,
          });

        expect(parsed)
          .toMatchObject({
            subject_type:
              "corridor",

            subject_id:
              "USA>CHN",

            origin_country_iso3:
              "USA",

            destination_country_iso3:
              "CHN",
          });
      },
    );


    it(
      "rejects mixed legacy and subject-aware forms",
      () => {
        expect(
          () =>
            parseExternalRiskGateBody({
              request_id:
                "mixed",

              country_iso3:
                "USA",

              subject: {
                type:
                  "country",

                country_iso3:
                  "USA",
              },

              policy,
            }),
        ).toThrow(
          "Provide either country_iso3 or subject, not both",
        );
      },
    );


    it(
      "rejects identical corridor endpoints",
      () => {
        expect(
          () =>
            parseExternalRiskGateBody({
              request_id:
                "same-endpoint",

              subject: {
                type:
                  "corridor",

                origin_country_iso3:
                  "USA",

                destination_country_iso3:
                  "USA",
              },

              policy,
            }),
        ).toThrow(
          "Corridor origin and destination must be different countries",
        );
      },
    );


    it(
      "rejects unsupported subject types",
      () => {
        expect(
          () =>
            parseExternalRiskGateBody({
              request_id:
                "unsupported",

              subject: {
                type:
                  "event",
              },

              policy,
            }),
        ).toThrow(
          "subject.type must be country or corridor",
        );
      },
    );
  },
);

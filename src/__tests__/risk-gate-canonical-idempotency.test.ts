import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  canonicalJson,
} from "../lib/canonical-json";


describe(
  "Risk Gate canonical idempotency hashing",
  () => {
    it(
      "serializes semantically identical nested objects identically regardless of key order",
      () => {
        const left = {
          request_id: "req-1234",
          subject: {
            type: "corridor",
            origin_country_iso3: "USA",
            destination_country_iso3: "CHN",
          },
          policy: {
            policy_version: "1.0.0",
            thresholds: {
              block: 70,
              review: 50,
            },
          },
          tags: ["treasury", "pilot"],
        };

        const right = {
          tags: ["treasury", "pilot"],
          policy: {
            thresholds: {
              review: 50,
              block: 70,
            },
            policy_version: "1.0.0",
          },
          subject: {
            destination_country_iso3: "CHN",
            origin_country_iso3: "USA",
            type: "corridor",
          },
          request_id: "req-1234",
        };

        expect(canonicalJson(left)).toBe(
          canonicalJson(right),
        );
      },
    );

    it(
      "preserves array order because array order can be semantically meaningful",
      () => {
        expect(
          canonicalJson({ values: [1, 2, 3] }),
        ).not.toBe(
          canonicalJson({ values: [3, 2, 1] }),
        );
      },
    );

    it(
      "normalizes negative zero to the standard JSON representation",
      () => {
        expect(canonicalJson(-0)).toBe("0");
        expect(canonicalJson(-0)).toBe(
          canonicalJson(0),
        );
      },
    );

    it(
      "fails closed for values outside the JSON data model",
      () => {
        expect(() =>
          canonicalJson({ bad: undefined }),
        ).toThrow(
          "Canonical JSON rejects non-JSON value",
        );
        expect(() =>
          canonicalJson(Number.POSITIVE_INFINITY),
        ).toThrow(
          "Canonical JSON rejects non-finite numbers",
        );
      },
    );

    it(
      "locks the Risk Gate wrapper to canonical payload hashing without changing bearer-token hashing",
      () => {
        const source = readFileSync(
          "src/lib/risk-gate-idempotency.server.ts",
          "utf8",
        );

        expect(source).toContain(
          "requestHash = sha256Text(\n      canonicalJson(payload),",
        );
        expect(source).toContain(
          "const tokenHash = sha256Text(token);",
        );
        expect(source).toContain(
          "execution_authorized: false",
        );
      },
    );
  },
);

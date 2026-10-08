import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const route =
  readFileSync(
    join(
      ROOT,
      "src/routes/api.risk-object-keys.ts",
    ),
    "utf8",
  );

describe(
  "public Risk Object trust endpoint",
  () => {
    it(
      "keeps GET public-key discovery and adds bounded POST verification",
      () => {
        expect(route).toContain(
          "GET: async",
        );
        expect(route).toContain(
          "POST: async",
        );
        expect(route).toContain(
          "verifyPublicRiskObjectArtifact",
        );
        expect(route).toContain(
          "MAX_VERIFY_BODY_BYTES",
        );
        expect(route).toContain(
          "risk_object_payload_too_large",
        );
        expect(route).toContain(
          "max_body_bytes",
        );
        expect(route).toContain(
          "client_local_with_public_keys",
        );
        expect(route).toContain(
          "content_type_must_be_application_json",
        );
      },
    );

    it(
      "uses only the server-validated registry and never accepts caller-supplied verification keys",
      () => {
        expect(route).toContain(
          "validatedRuntimeVerificationRegistry",
        );
        expect(route).toContain(
          "verification_keys:",
        );
        expect(route).toContain(
          "verificationKeys",
        );
        expect(route).not.toContain(
          "body.verification_keys",
        );
        expect(route).not.toContain(
          '"verification_keys" in body',
        );
        expect(route).not.toContain(
          "RISK_OBJECT_SIGNING_PRIVATE_KEY",
        );
      },
    );

    it(
      "prevents caching verification outcomes",
      () => {
        expect(route).toContain(
          '"cache-control": "no-store"',
        );
        expect(route).not.toContain(
          '"public, max-age=300, must-revalidate"',
        );
      },
    );
  },
);

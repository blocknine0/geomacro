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
          "deployedPublicVerificationKeys",
        );
        expect(route).toContain(
          "pinnedRiskObjectVerificationKeys",
        );
        expect(route).toContain(
          "pinnedRiskObjectVerificationKeySet",
        );
        expect(route).toContain(
          "pinnedRiskObjectVerificationKeys();",
        );
        expect(route).toContain(
          "pinnedRiskObjectVerificationKeySet();",
        );
        expect(route).not.toContain(
          "ensureRiskObjectRuntimePublicKey",
        );
        expect(route).not.toContain(
          "publicRiskObjectVerificationKeySet",
        );
        expect(route).not.toContain(
          'new URL(\n      "/api/risk-object-keys",\n      request.url',
        );
        expect(route).not.toContain(
          "await fetch(\n        registryUrl",
        );
        expect(route).toContain(
          "verification_keys:\n          verificationKeys",
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
      "uses the source-pinned public registry instead of signing-runtime env or same-origin self-fetch",
      () => {
        expect(route).toContain(
          "function deployedPublicVerificationKeys()",
        );
        expect(route).toContain(
          "ensureRiskObjectRuntimePublicKey();",
        );
        expect(route).toContain(
          "publicRiskObjectVerificationKeySet();",
        );
        expect(route).toContain(
          "const keySet: RiskObjectVerificationKeys = {};",
        );
        expect(route).toContain(
          "deployedPublicVerificationKeys();",
        );
        expect(route).not.toContain(
          "await deployedPublicVerificationKeys(",
        );
        expect(route).not.toContain(
          "fetch(\n        registryUrl",
        );
      },
    );

    it(
      "never exposes a caller-supplied verification key bypass",
      () => {
        expect(route).toContain(
          '!("risk_object" in body)',
        );
        expect(route).not.toContain(
          '"verification_keys" in body',
        );
        expect(route).not.toContain(
          "body.verification_keys",
        );
        expect(route).not.toContain(
          "RISK_OBJECT_SIGNING_PRIVATE_KEY",
        );
        expect(route).toContain(
          "verification_key_registry_unavailable",
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

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PINNED_RISK_OBJECT_PUBLIC_REGISTRY_VERSION,
  pinnedRiskObjectVerificationKeySet,
  pinnedRiskObjectVerificationKeys,
} from "../lib/risk-object-public-registry";

describe("pinned Risk Object public registry", () => {
  it("pins the deployed lifecycle set independently of signing secrets", () => {
    const set = pinnedRiskObjectVerificationKeySet();
    expect(PINNED_RISK_OBJECT_PUBLIC_REGISTRY_VERSION).toBe(
      "geomacro-risk-public-registry-2026-10-08.v1",
    );
    expect(set.issuer).toBe("Geomacro");
    expect(set.signature_scheme).toBe("Ed25519");
    expect(set.canonicalization).toBe("geomacro-canonical-json-v1");
    expect(set.keys.map((key) => [key.key_id, key.status])).toEqual([
      ["geomacro-risk-2026-02", "retired"],
      ["geomacro-risk-2026-03", "active"],
    ]);
  });

  it("matches the independently captured deployed public-key fingerprints", () => {
    const keys = pinnedRiskObjectVerificationKeys();
    const expected = {
      "geomacro-risk-2026-02":
        "526a7956d2a9ccd10b94d05fd4bc19e4464f1e431734bc60ab5b0d9c9b1ad6ec",
      "geomacro-risk-2026-03":
        "432f35218570c80c09d56a8005390f6d3111a932ba93298f4ffd86d9896c0b90",
    };
    for (const [keyId, fingerprint] of Object.entries(expected)) {
      const record = keys[keyId];
      expect(record).toBeTruthy();
      const publicKey =
        typeof record === "string" ? record : record.public_key_spki_b64;
      expect(
        createHash("sha256")
          .update(Buffer.from(publicKey, "base64"))
          .digest("hex"),
      ).toBe(fingerprint);
    }
  });
});

import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type TestVector = {
  specification: string;
  canonical_signable_json: string;
  payload_hash: string;
  public_key_spki_b64: string;
  signature_b64: string;
  expected_payload_hash: string;
  expected_signature_verifies: boolean;
};

describe("geomacro-canonical-json-v1 test vector", () => {
  it("reproduces the documented payload hash and Ed25519 signature", () => {
    const vector = JSON.parse(
      readFileSync(
        "docs/examples/gro-1.1-canonical-v1-test-vector.json",
        "utf8",
      ),
    ) as TestVector;

    expect(vector.specification).toBe("geomacro-canonical-json-v1");

    const message = Buffer.from(
      vector.canonical_signable_json,
      "utf8",
    );

    const payloadHash = createHash("sha256")
      .update(message)
      .digest("hex");

    expect(payloadHash).toBe(vector.payload_hash);
    expect(payloadHash).toBe(vector.expected_payload_hash);

    const publicKey = createPublicKey({
      key: Buffer.from(vector.public_key_spki_b64, "base64"),
      format: "der",
      type: "spki",
    });

    expect(publicKey.asymmetricKeyType).toBe("ed25519");

    const signatureVerified = verify(
      null,
      message,
      publicKey,
      Buffer.from(vector.signature_b64, "base64"),
    );

    expect(signatureVerified).toBe(
      vector.expected_signature_verifies,
    );
    expect(signatureVerified).toBe(true);
  });
});

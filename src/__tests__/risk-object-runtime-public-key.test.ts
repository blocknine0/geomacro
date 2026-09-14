import {
  generateKeyPairSync,
} from "node:crypto";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  ensureRiskObjectRuntimePublicKey,
} from "../lib/risk-object-runtime-public-key.server";

const ENV_NAMES = [
  "RISK_OBJECT_SIGNING_KEY_ID",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
  "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
] as const;

const original = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
) as Record<(typeof ENV_NAMES)[number], string | undefined>;

function restoreEnv() {
  for (const name of ENV_NAMES) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(restoreEnv);

describe("Risk Object runtime public-key derivation", () => {
  it("derives the Ed25519 public key when hosting omits the redundant public secret", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateB64 = Buffer.from(
      privateKey.export({ format: "der", type: "pkcs8" }),
    ).toString("base64");
    const expectedPublic = Buffer.from(
      publicKey.export({ format: "der", type: "spki" }),
    ).toString("base64");

    process.env.RISK_OBJECT_SIGNING_KEY_ID = "runtime-test-key";
    process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 = privateB64;
    delete process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;

    expect(ensureRiskObjectRuntimePublicKey()).toBe(expectedPublic);
    expect(process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64).toBe(
      expectedPublic,
    );
  });

  it("preserves an explicitly configured public key for the existing mismatch checks", () => {
    process.env.RISK_OBJECT_SIGNING_KEY_ID = "runtime-test-key";
    process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 = "explicit-value";
    delete process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;

    expect(ensureRiskObjectRuntimePublicKey()).toBe("explicit-value");
    expect(process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64).toBe(
      "explicit-value",
    );
  });

  it("does not invent verification material when the signing key is absent", () => {
    delete process.env.RISK_OBJECT_SIGNING_KEY_ID;
    delete process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;
    delete process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;

    expect(ensureRiskObjectRuntimePublicKey()).toBeNull();
    expect(process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64).toBeUndefined();
  });
});

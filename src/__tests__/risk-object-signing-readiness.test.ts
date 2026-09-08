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
  validateRiskObjectSigningReadiness,
} from "../lib/risk-object-signing-readiness.server";

function keyPair() {
  const {
    privateKey,
    publicKey,
  } =
    generateKeyPairSync(
      "ed25519",
    );

  return {
    privateKey:
      privateKey
        .export({
          format: "der",
          type: "pkcs8",
        })
        .toString("base64"),
    publicKey:
      publicKey
        .export({
          format: "der",
          type: "spki",
        })
        .toString("base64"),
  };
}

const NAMES = [
  "RISK_OBJECT_SIGNING_KEY_ID",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
  "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
  "RISK_OBJECT_SIGNING_KEY_NOT_BEFORE",
  "RISK_OBJECT_SIGNING_KEY_NOT_AFTER",
  "RISK_OBJECT_VERIFY_KEYS_JSON",
] as const;

const ORIGINAL =
  Object.fromEntries(
    NAMES.map(
      name => [
        name,
        process.env[name],
      ],
    ),
  );

function configure(
  input?: {
    status?:
      "active" |
      "retired" |
      "revoked";
    notBefore?: string;
    notAfter?: string;
  },
) {
  const key =
    keyPair();

  const keyId =
    "geomacro-risk-readiness-test";

  process.env
    .RISK_OBJECT_SIGNING_KEY_ID =
    keyId;
  process.env
    .RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 =
    key.privateKey;
  process.env
    .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 =
    key.publicKey;
  process.env
    .RISK_OBJECT_VERIFY_KEYS_JSON =
    JSON.stringify({
      [keyId]: {
        public_key_spki_b64:
          key.publicKey,
        status:
          input?.status ??
          "active",
        not_before:
          input?.notBefore ??
          null,
        not_after:
          input?.notAfter ??
          null,
      },
    });

  return {
    key,
    keyId,
  };
}

afterEach(
  () => {
    for (
      const name of NAMES
    ) {
      const value =
        ORIGINAL[name];

      if (
        value === undefined
      ) {
        delete process.env[name];
      } else {
        process.env[name] =
          value;
      }
    }
  },
);

describe(
  "Risk Object signing readiness",
  () => {
    it(
      "accepts a matching active Ed25519 signing configuration",
      () => {
        const {
          keyId,
        } =
          configure({
            notBefore:
              "2026-09-01T00:00:00.000Z",
            notAfter:
              "2026-10-01T00:00:00.000Z",
          });

        expect(
          validateRiskObjectSigningReadiness(
            new Date(
              "2026-09-08T12:00:00.000Z",
            ),
          ),
        ).toEqual({
          ready: true,
          key_id:
            keyId,
          status: "active",
          not_before:
            "2026-09-01T00:00:00.000Z",
          not_after:
            "2026-10-01T00:00:00.000Z",
        });
      },
    );

    it(
      "fails readiness for a retired current key",
      () => {
        configure({
          status: "retired",
        });

        expect(
          () =>
            validateRiskObjectSigningReadiness(),
        ).toThrow(
          "Current Risk Object signing key is not active",
        );
      },
    );

    it(
      "fails readiness for a revoked current key",
      () => {
        configure({
          status: "revoked",
        });

        expect(
          () =>
            validateRiskObjectSigningReadiness(),
        ).toThrow(
          "Current Risk Object signing key is not active",
        );
      },
    );

    it(
      "fails readiness after key expiry",
      () => {
        configure({
          notAfter:
            "2026-09-07T23:59:59.999Z",
        });

        expect(
          () =>
            validateRiskObjectSigningReadiness(
              new Date(
                "2026-09-08T00:00:00.000Z",
              ),
            ),
        ).toThrow(
          "Current Risk Object signing key has expired",
        );
      },
    );

    it(
      "fails readiness when private and public key material differ",
      () => {
        const first =
          configure();
        const second =
          keyPair();

        process.env
          .RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 =
          second.privateKey;

        expect(
          () =>
            validateRiskObjectSigningReadiness(),
        ).toThrow(
          "Risk Object signing private/public key mismatch",
        );

        // Keep TypeScript aware that the first configuration is intentional.
        expect(
          first.key.publicKey,
        ).not.toBe(
          second.publicKey,
        );
      },
    );
  },
);

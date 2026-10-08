import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  ensureRiskObjectRuntimePublicKey,
} from "../lib/risk-object-runtime-public-key.server";

import {
  assertRiskObjectJsonKeysSafe,
  publicRiskObjectVerificationKeySet,
  type RiskObjectVerificationKeys,
} from "../lib/risk-object-signing.server";

import {
  verifyPublicRiskObjectArtifact,
} from "../lib/risk-object-verification.server";

const MAX_VERIFY_BODY_BYTES =
  512 * 1024;

function jsonResponse(
  body: unknown,
  status = 200,
  headers?:
    Record<string, string>,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "x-content-type-options":
          "nosniff",
        ...headers,
      },
    },
  );
}

function deployedPublicVerificationKeys():
  RiskObjectVerificationKeys | null {
  const keySet:
    RiskObjectVerificationKeys = {};

  const rawRegistry =
    process.env
      .RISK_OBJECT_VERIFY_KEYS_JSON
      ?.trim();

  if (rawRegistry) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(
        rawRegistry,
      );
    } catch {
      return null;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    for (
      const [keyId, value] of
      Object.entries(parsed)
    ) {
      if (
        typeof value !== "string" &&
        (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value)
        )
      ) {
        return null;
      }

      keySet[keyId] =
        value as
          RiskObjectVerificationKeys[string];
    }
  }

  const currentKeyId =
    process.env
      .RISK_OBJECT_SIGNING_KEY_ID
      ?.trim();

  const currentPublicKey =
    process.env
      .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64
      ?.trim();

  if (
    Boolean(currentKeyId) !==
    Boolean(currentPublicKey)
  ) {
    return null;
  }

  if (
    currentKeyId &&
    currentPublicKey
  ) {
    const existing =
      keySet[currentKeyId];

    if (existing) {
      const existingPublicKey =
        typeof existing === "string"
          ? existing.trim()
          : existing
              .public_key_spki_b64
              ?.trim();

      if (
        existingPublicKey !==
        currentPublicKey
      ) {
        return null;
      }
    } else {
      keySet[currentKeyId] = {
        public_key_spki_b64:
          currentPublicKey,
        status: "active",
        not_before:
          process.env
            .RISK_OBJECT_SIGNING_KEY_NOT_BEFORE
            ?.trim() ||
          null,
        not_after:
          process.env
            .RISK_OBJECT_SIGNING_KEY_NOT_AFTER
            ?.trim() ||
          null,
      };
    }
  }

  if (
    Object.keys(keySet).length === 0
  ) {
    return null;
  }

  try {
    // Validate every configured public key, lifecycle state and validity
    // window without initializing or deriving any signing private key.
    publicRiskObjectVerificationKeySet(
      keySet,
    );
  } catch {
    return null;
  }

  return keySet;
}

async function verifyRequest(
  request: Request,
) {
  const contentType =
    request.headers
      .get("content-type")
      ?.toLowerCase() ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "content_type_must_be_application_json",
      },
      415,
      {
        "cache-control": "no-store",
      },
    );
  }

  let raw = "";

  try {
    raw = await request.text();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "request_body_unreadable",
      },
      400,
      {
        "cache-control": "no-store",
      },
    );
  }

  if (
    new TextEncoder()
      .encode(raw)
      .byteLength >
    MAX_VERIFY_BODY_BYTES
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "risk_object_payload_too_large",
        max_bytes:
          MAX_VERIFY_BODY_BYTES,
      },
      413,
      {
        "cache-control": "no-store",
      },
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_json",
      },
      400,
      {
        "cache-control": "no-store",
      },
    );
  }

  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("risk_object" in body)
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "risk_object_is_required",
      },
      400,
      {
        "cache-control": "no-store",
      },
    );
  }

  try {
    assertRiskObjectJsonKeysSafe(
      (
        body as {
          risk_object: unknown;
        }
      ).risk_object,
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "forbidden_risk_object_json_key",
      },
      400,
      {
        "cache-control": "no-store",
      },
    );
  }

  const verificationKeys =
    deployedPublicVerificationKeys();

  if (!verificationKeys) {
    return jsonResponse(
      {
        ok: false,
        error:
          "verification_key_registry_unavailable",
      },
      503,
      {
        "cache-control": "no-store",
      },
    );
  }

  const report =
    verifyPublicRiskObjectArtifact(
      (
        body as {
          risk_object: unknown;
        }
      ).risk_object,
      {
        verification_keys:
          verificationKeys,
      },
    );

  if (
    report.reason_codes.includes(
      "verification_key_registry_error",
    )
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "verification_key_registry_invalid",
        verification: report,
      },
      503,
      {
        "cache-control": "no-store",
      },
    );
  }

  return jsonResponse(
    {
      ok: true,
      verification: report,
    },
    200,
    {
      // Verification is evaluated against current key lifecycle and time.
      "cache-control": "no-store",
    },
  );
}

export const Route =
  createFileRoute(
    "/api/risk-object-keys",
  )({
    server: {
      handlers: {
        GET: async () => {
          try {
            ensureRiskObjectRuntimePublicKey();

            const keySet =
              publicRiskObjectVerificationKeySet();

            if (
              keySet.keys.length === 0
            ) {
              return jsonResponse(
                {
                  ok: false,
                  error:
                    "verification_keys_unavailable",
                },
                503,
                {
                  "cache-control":
                    "no-store",
                },
              );
            }

            return jsonResponse(
              {
                ok: true,
                verification_endpoint: {
                  method: "POST",
                  max_body_bytes:
                    MAX_VERIFY_BODY_BYTES,
                  intended_for:
                    "bounded_risk_objects",
                  body: {
                    risk_object:
                      "Geomacro Risk Object",
                  },
                },
                large_object_verification: {
                  mode:
                    "client_local_with_public_keys",
                  canonicalization:
                    "geomacro-canonical-json-v1",
                  signature_scheme:
                    "Ed25519",
                  reason:
                    "Large signed artifacts must be verified locally against this deployed public-key registry instead of being re-uploaded through the bounded POST endpoint.",
                },
                ...keySet,
              },
              200,
              {
                // Trust discovery is a launch/security boundary. Do not let
                // an intermediary serve a pre-deploy contract or stale key
                // lifecycle state to independent verifiers.
                "cache-control":
                  "no-store",
              },
            );
          } catch {
            // Never leak environment/configuration details from a public
            // endpoint. Operational health surfaces can report a coarse
            // configuration failure separately.
            return jsonResponse(
              {
                ok: false,
                error:
                  "verification_key_registry_invalid",
              },
              503,
              {
                "cache-control":
                  "no-store",
              },
            );
          }
        },

        POST: async ({
          request,
        }) =>
          verifyRequest(request),
      },
    },
  });

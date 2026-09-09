import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  publicRiskObjectVerificationKeySet,
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

  const report =
    verifyPublicRiskObjectArtifact(
      (
        body as {
          risk_object: unknown;
        }
      ).risk_object,
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
                  body: {
                    risk_object:
                      "Geomacro Risk Object",
                  },
                },
                ...keySet,
              },
              200,
              {
                // Public verification keys may be cached briefly, but
                // revocation/rotation changes must propagate quickly.
                "cache-control":
                  "public, max-age=300, must-revalidate",
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

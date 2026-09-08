import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  publicRiskObjectVerificationKeySet,
} from "../lib/risk-object-signing.server";

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
        ...headers,
      },
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
      },
    },
  });

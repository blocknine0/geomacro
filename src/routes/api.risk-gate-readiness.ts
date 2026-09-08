import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  evaluateRiskGateReadiness,
} from "../lib/risk-gate-readiness.server";

export const Route =
  createFileRoute(
    "/api/risk-gate-readiness",
  )({
    server: {
      handlers: {
        GET: async () => {
          try {
            const readiness =
              await evaluateRiskGateReadiness();

            return Response.json(
              readiness,
              {
                status:
                  readiness.status ===
                    "ready"
                    ? 200
                    : 503,
                headers: {
                  "Cache-Control":
                    "no-store",
                  "X-Content-Type-Options":
                    "nosniff",
                },
              },
            );
          } catch {
            return Response.json(
              {
                status:
                  "not_ready",
                checks: {
                  database: false,
                  audit_store: false,
                  verification_keys: false,
                  fresh_country_risk_object: false,
                  publisher_signing: false,
                },
              },
              {
                status: 503,
                headers: {
                  "Cache-Control":
                    "no-store",
                  "X-Content-Type-Options":
                    "nosniff",
                },
              },
            );
          }
        },
      },
    },
  });

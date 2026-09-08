import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  handleIdempotentExternalRiskGateRequest,
} from "../lib/risk-gate-idempotency.server";


export const Route =
  createFileRoute(
    "/api/risk-gate",
  )({
    server: {
      handlers: {
        POST: async ({
          request,
        }) => {
          return (
            handleIdempotentExternalRiskGateRequest(
              request,
            )
          );
        },
      },
    },
  });

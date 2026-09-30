import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  handleCommercialExternalRiskGateRequest,
} from "../lib/risk-gate-commercial-boundary.server";


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
            handleCommercialExternalRiskGateRequest(
              request,
            )
          );
        },
      },
    },
  });

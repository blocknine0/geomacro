import {
  createFileRoute,
} from "@tanstack/react-router";

import {
  handleExternalRiskGateRequest,
} from "../lib/risk-gate-api.server";


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
            handleExternalRiskGateRequest(
              request,
            )
          );
        },
      },
    },
  });

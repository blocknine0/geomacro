import { createFileRoute } from "@tanstack/react-router";
import {
  AGENT_CAPABILITIES,
  GEOMACRO_AGENT_API_VERSION,
  GEOMACRO_AGENT_SCHEMA_VERSION,
} from "@/lib/agent/agent-api-contract";
import { getAgentPaymentConfig } from "@/lib/agent-payment.server";

export const Route = createFileRoute("/api/v1/agent/catalog")({
  server: {
    handlers: {
      GET: async () => {
        const payment = getAgentPaymentConfig();
        return Response.json({
          apiVersion: GEOMACRO_AGENT_API_VERSION,
          schemaVersion: GEOMACRO_AGENT_SCHEMA_VERSION,
          service: "Geomacro Agent Intelligence API",
          capabilities: [
            {
              id: AGENT_CAPABILITIES.EVENT_INTELLIGENCE,
              method: "GET",
              path: "/api/v1/agent/events/:eventId/intelligence",
              availability: payment.enabled ? "payment_configured" : "not_configured",
            },
          ],
          payment: {
            model: payment.enabled ? "x402" : "not_live",
            status: payment.enabled ? "configured_boundary" : "not_configured",
          },
        });
      },
    },
  },
});

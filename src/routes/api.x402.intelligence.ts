import { createFileRoute } from "@tanstack/react-router";
import { mainnetIntelligenceHandlers } from "../lib/mainnet-intelligence-endpoint.server";

export const Route = createFileRoute("/api/x402/intelligence")({
  server: {
    handlers: mainnetIntelligenceHandlers,
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { mainnetIntelligenceHandlers } from "../lib/mainnet-intelligence-endpoint.server";

export const Route = createFileRoute("/api/v1/intelligence/query")({
  server: {
    handlers: mainnetIntelligenceHandlers,
  },
});

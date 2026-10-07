import { createFileRoute } from "@tanstack/react-router";
import {
  CANONICAL_MAINNET_INTELLIGENCE_PATH,
  mainnetIntelligenceHandlers,
} from "./api.x402.intelligence";

export const Route = createFileRoute(CANONICAL_MAINNET_INTELLIGENCE_PATH)({
  server: {
    handlers: mainnetIntelligenceHandlers,
  },
});

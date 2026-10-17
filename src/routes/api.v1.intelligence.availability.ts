import { createFileRoute } from "@tanstack/react-router";
import { earnFirstStructuralOfferHandlers } from "../lib/earn-first-structural-offers.server";

/** Buyer discovery only. Real funds stay exclusively on canonical x402 query. */
export const Route = createFileRoute("/api/v1/intelligence/availability")({
  server: { handlers: earnFirstStructuralOfferHandlers },
});

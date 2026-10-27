import { createFileRoute } from "@tanstack/react-router";
import { storeProductAvailabilityHandlers } from "../lib/store-product-availability.server";

/** Data-only readiness for each approved paid product variant.
 * Canonical checkout and actual payment remain on /api/v1/intelligence/query.
 */
export const Route = createFileRoute("/api/v1/intelligence/products-availability")({
  server: { handlers: storeProductAvailabilityHandlers },
});

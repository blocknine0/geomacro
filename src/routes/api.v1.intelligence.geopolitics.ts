import { createFileRoute } from "@tanstack/react-router";
import { createCategoryIntelligenceHandlers } from "../lib/category-intelligence-alias.server";

export const Route = createFileRoute("/api/v1/intelligence/geopolitics")({
  server: {
    handlers: createCategoryIntelligenceHandlers({
      topics: ["conflict_geopolitics"],
      requiredModules: ["geopolitical_security"],
    }),
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { createCategoryIntelligenceHandlers } from "../lib/category-intelligence-alias.server";

export const Route = createFileRoute("/api/v1/intelligence/critical-minerals")({
  server: {
    handlers: createCategoryIntelligenceHandlers({
      category: "critical-minerals",
      path: "/api/v1/intelligence/critical-minerals",
      topics: ["critical_minerals"],
      requiredModules: ["critical_minerals"],
    }),
  },
});

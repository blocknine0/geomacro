import { createFileRoute } from "@tanstack/react-router";
import { createCategoryIntelligenceHandlers } from "../lib/category-intelligence-alias.server";

export const Route = createFileRoute("/api/v1/intelligence/macro-fx")({
  server: {
    handlers: createCategoryIntelligenceHandlers({
      category: "macro-fx",
      path: "/api/v1/intelligence/macro-fx",
      topics: ["macro_risk", "fx_external_risk"],
      requiredModules: ["external_fx", "macro_monetary", "sovereign_fiscal"],
    }),
  },
});

import { createFileRoute } from "@tanstack/react-router";
import {
  GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
  GEOMACRO_INTELLIGENCE_LAUNCH_DELIVERY_TARGET,
  GEOMACRO_INTELLIGENCE_PRICE_USDC,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
} from "../lib/geomacro-intelligence-contract";

export const Route = createFileRoute("/api/intelligence/capabilities")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            ok: true,
            provider: {
              id: "geomacro",
              name: "Geomacro",
              endpoint: "/api/x402/intelligence",
            },
            product: {
              id: GEOMACRO_INTELLIGENCE_PRODUCT_ID,
              response_schema: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
              contract_version: GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
              delivery: "x402",
              asset: "USDC",
              early_adoption_price_usdc: GEOMACRO_INTELLIGENCE_PRICE_USDC,
              initial_successful_delivery_target:
                GEOMACRO_INTELLIGENCE_LAUNCH_DELIVERY_TARGET,
              later_reference_price_usdc: "0.10",
            },
            coverage: {
              scope: "country_and_directional_corridor",
              country_registry: "runtime_registry",
              note:
                "Country-level commercial deliverability is determined at request time by governed coverage, freshness and commercial-eligibility checks.",
            },
            intelligence: {
              current_state: true,
              historical_context: ["previous_published", "30d", "90d"],
              change_attribution: true,
              canonical_developments: true,
              freshness: true,
              state_version: true,
              signed_risk_object_attestation: true,
            },
            commercial_boundary: {
              raw_source_identity_exposed: false,
              raw_article_material_exposed: false,
              source_names_in_paid_response: false,
              execution_authorized: false,
            },
            endpoints: {
              paid_intelligence: "POST /api/x402/intelligence",
              free_capability_discovery: "GET /api/intelligence/capabilities",
              free_state_check:
                "GET /api/intelligence/state?country=ISO3&known_state_version=...",
              risk_object_keys: "GET /api/risk-object-keys",
            },
          },
          {
            headers: {
              "Cache-Control": "public, max-age=300, must-revalidate",
              "X-Content-Type-Options": "nosniff",
            },
          },
        ),
    },
  },
});

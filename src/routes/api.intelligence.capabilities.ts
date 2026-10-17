import { createFileRoute } from "@tanstack/react-router";
import {
  GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
} from "../lib/geomacro-intelligence-contract";
import {GEOMACRO_CAPABILITY_PRICING_VERSION,capabilityPricingCatalog}
  from "../lib/capability-pricing-catalog";
import {GEOMACRO_PAID_PRICING_PATH} from "../lib/geomacro-paid-pricing-manifest.server";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
  GEOMACRO_STRUCTURED_LICENSE_TERMS}
  from "../lib/geomacro-structured-commercial-license";

export const Route = createFileRoute("/api/intelligence/capabilities")({
  server: {
    handlers: {
      GET: async ({request}:{request:Request}) => {
        // Public legal terms are a back-end API view; this avoids changing
        // the website while the presentation lock is active.
        const view=new URL(request.url).searchParams.get("view");
        if(view==="license"){
          return Response.json(GEOMACRO_STRUCTURED_LICENSE_TERMS,{
            headers:{"Cache-Control":"public, max-age=300, must-revalidate",
              "X-Content-Type-Options":"nosniff"}
          });
        }
        return Response.json(
          {
            ok: true,
            provider: {
              id: "geomacro",
              name: "Geomacro",
              endpoint: "/api/v1/intelligence/query",
            },
            product: {
              id: GEOMACRO_INTELLIGENCE_PRODUCT_ID,
              response_schema: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
              contract_version: GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
              delivery: "x402",
              asset: "USDC",
              pricing_contract_version: GEOMACRO_CAPABILITY_PRICING_VERSION,
              pricing_model:"EXACT_CAPABILITY_VARIANT_NO_FLAT_PRICE",
              availability:"REALTIME_EVIDENCE_AND_DELIVERY_PROOF_REQUIRED",
            },
            capability_pricing:{
              version:GEOMACRO_CAPABILITY_PRICING_VERSION,
              currency:"USDC",decimals:6,
              capabilities:capabilityPricingCatalog(),
              available_before_payment:false,
              fixed_tier_only:true,automatic_upgrade:false,
              risk_gate_includes_signed_object:true,
              credit_units_are_not_usdc:true,
              no_charge_when_unavailable:true,
              label:"Pay only for successfully prepared, verified and deliverable intelligence. No mandatory subscription.",
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
            commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
            commercial_boundary: {
              raw_source_identity_exposed: false,
              raw_article_material_exposed: false,
              source_names_in_paid_response: false,
              execution_authorized: false,
            },
            endpoints: {
              paid_intelligence: "POST /api/v1/intelligence/query",
              free_capability_discovery: "GET /api/intelligence/capabilities",
              paid_price_catalog: "GET "+GEOMACRO_PAID_PRICING_PATH,
              nonpayable_usdc_preflight: "POST /api/v1/payments/preflight",
              official_agent: "GET/POST /api/v1/agent",
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
        );
      },
    },
  },
});

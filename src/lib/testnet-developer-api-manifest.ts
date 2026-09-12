import {
  STRUCTURED_DATA_REGISTRY_VERSION,
  STRUCTURED_TIER_REGISTRY,
} from "./structured-data-entitlement-registry";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  TESTNET_API_PRICING_VERSION,
} from "./testnet-api-pricing";
import {
  TESTNET_INTELLIGENCE_API_VERSION,
  TESTNET_INTELLIGENCE_CAPABILITIES,
  TESTNET_INTELLIGENCE_CAPABILITY_CATALOG,
  TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
  TESTNET_INTELLIGENCE_PRICE_TABLE,
} from "./testnet-intelligence-contract";
import {
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_DURATION_DAYS,
  TESTNET_USDC_ACCESS_VERSION,
} from "./testnet-usdc-access-contract";

export const TESTNET_DEVELOPER_API_MANIFEST_VERSION =
  "testnet-developer-api-manifest-v1.0.0" as const;

export function testnetDeveloperApiManifest() {
  const tier = STRUCTURED_TIER_REGISTRY.testnet_tester;

  return {
    manifest_version: TESTNET_DEVELOPER_API_MANIFEST_VERSION,
    api_version: TESTNET_INTELLIGENCE_API_VERSION,
    registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    pricing_version: TESTNET_API_PRICING_VERSION,
    payment_contract_version: TESTNET_USDC_ACCESS_VERSION,
    environment: "testnet",
    commercial_revenue: false,
    source_of_truth: "geomacro_canonical_intelligence_pipeline",
    endpoints: {
      manifest: {
        method: "GET",
        path: "/api/testnet/manifest",
        authentication_required: false,
        metered: false,
      },
      account: {
        method: "GET",
        path: "/api/testnet/account",
        authentication_required: true,
        metered: false,
      },
      intelligence: {
        method: "POST",
        path: "/api/testnet/intelligence",
        authentication_required: true,
        metered: true,
      },
    },
    authentication: {
      preferred: "Authorization: GeomacroTest <API_KEY>.<API_SECRET>",
      alternate_headers: [
        "X-Geomacro-Api-Key: <API_KEY>",
        "X-Geomacro-Api-Secret: <API_SECRET>",
      ],
      api_key_prefix: "gmk_test_",
      api_secret_prefix: "gms_test_",
      api_secret_stored_in_plaintext: false,
    },
    entitlement: {
      tier: tier.tier,
      api_access: tier.api_access,
      included_capabilities: TESTNET_INTELLIGENCE_CAPABILITIES,
      history_mode: tier.history_mode,
      max_subjects_per_request: tier.max_subjects_per_request,
      max_structural_observations: tier.max_structural_observations,
      max_evidence_references: tier.max_evidence_references,
      signed_risk_objects: tier.signed_risk_objects,
      risk_gate: tier.risk_gate,
      execution_authorized: tier.execution_authorized,
    },
    pricing: {
      model: "pay_per_call",
      upfront_payment_required: false,
      credit_price_testnet_usdc: TESTNET_API_CREDIT_PRICE_USDC,
      max_credits_per_30_days: TESTNET_API_FIXED_CREDITS,
      duration_days: TESTNET_USDC_ACCESS_DURATION_DAYS,
      capability_prices: TESTNET_INTELLIGENCE_PRICE_TABLE,
    },
    payment_flow: [
      "Send an authenticated intelligence request without payment proof.",
      "Receive HTTP 402 with the exact required Testnet USDC amount, receiver and supported chain details.",
      "Send exactly that Testnet USDC amount from the verified tester wallet.",
      "Retry the same request_id and identical capability payload with chain_key, tx_hash and payer_address proof.",
      "Geomacro verifies the Testnet settlement, consumes credits exactly once and returns the machine-readable intelligence response.",
      "Replay of the same settled request_id is idempotent and must not double-charge credits or payment.",
    ],
    supported_payment_chains: Object.values(TESTNET_USDC_ACCESS_CHAINS),
    capabilities: TESTNET_INTELLIGENCE_CAPABILITY_CATALOG,
    full_product_api_surface: {
      natural_language_intelligence: "intelligence_query",
      global_risk_index_and_change_attribution: "gri_read",
      country_structural_intelligence: [
        "structural_country_digest",
        "structural_country_profile",
      ],
      corridor_structural_intelligence: [
        "structural_corridor_digest",
        "structural_corridor_profile",
      ],
      signed_machine_readable_risk_object: "signed_risk_object",
      full_machine_decision_bundle: "risk_gate_bundle",
    },
    boundaries: TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
  } as const;
}

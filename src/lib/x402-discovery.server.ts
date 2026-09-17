import {
  coinbaseX402PaymentRequirements,
  getCoinbaseX402Config,
} from "./coinbase-x402.server";
import {
  getCircleGatewayProductionConfig,
  getCircleGatewayProductionRequirement,
} from "./circle-gateway-x402-production.server";
import { providerRealFundsSecurityState } from "./provider-real-funds-security.server";
import { getCommercialLaunchState } from "./commercial-launch-gate.server";

const CANONICAL_PRODUCT = "geomacro_adaptive_risk_intelligence_v1" as const;

export async function buildX402DiscoveryDocument(originInput: string) {
  const origin = originInput.replace(/\/$/, "");
  const state = providerRealFundsSecurityState();
  const launch = getCommercialLaunchState();
  const providerAvailable = (provider: string, configured: boolean) =>
    configured &&
    state.ready &&
    launch.authorized &&
    !launch.disabledProviders.includes(provider);
  const resources: Array<Record<string, unknown>> = [];
  const activeProviders = new Set<string>();

  if (providerAvailable("coinbase_x402", state.providers.coinbase_mainnet)) {
    try {
      const config = getCoinbaseX402Config();
      if (config?.environment === "production") {
        resources.push({
          resource: `${origin}/api/x402/intelligence`,
          method: "POST",
          provider: "coinbase_x402",
          product: CANONICAL_PRODUCT,
          description:
            "Adaptive source-governed geopolitical and macro risk intelligence with signed Risk Object and non-executing Risk Gate context where currently deliverable.",
          tags: [
            "geopolitical-risk",
            "macro-risk",
            "country-risk",
            "corridor-risk",
            "risk-gate",
            "ai-agents",
          ],
          accepts: [coinbaseX402PaymentRequirements(config)],
          availability: `${origin}/api/x402/risk/availability`,
          execution_authorized: false,
        });
        activeProviders.add("coinbase_x402");
      }
    } catch {
      // Fail closed. A half-configured production rail must never be advertised.
    }
  }

  if (providerAvailable("circle_gateway_x402", state.providers.circle_gateway_mainnet)) {
    try {
      const config = getCircleGatewayProductionConfig();
      if (config?.environment === "production") {
        const requirement = await getCircleGatewayProductionRequirement(config);
        resources.push({
          resource: `${origin}/api/x402/circle/intelligence`,
          method: "POST",
          provider: "circle_gateway_x402",
          product: CANONICAL_PRODUCT,
          description:
            "Adaptive source-governed geopolitical and macro risk intelligence paid through Circle Gateway on the approved Base-mainnet USDC rail.",
          tags: [
            "geopolitical-risk",
            "macro-risk",
            "country-risk",
            "corridor-risk",
            "risk-gate",
            "circle-gateway",
            "ai-agents",
          ],
          accepts: [requirement],
          availability: `${origin}/api/x402/risk/availability`,
          execution_authorized: false,
        });
        activeProviders.add("circle_gateway_x402");
      }
    } catch {
      // Fail closed if Circle support/config cannot be proven at request time.
    }
  }

  return {
    x402Version: 2,
    name: "Geomacro Risk Intelligence",
    description:
      "Machine-readable geopolitical and macro risk intelligence for software and AI-agent pre-flight decisions.",
    status: resources.length > 0 ? "production" : "prelaunch",
    productionFundsAuthorized: resources.length > 0,
    resources,
    freeResources: [
      {
        resource: `${origin}/api/x402/risk/availability`,
        method: "POST",
        price: "free",
        description:
          "No-charge deliverability check. It determines whether the requested intelligence can be safely produced before any payment is requested.",
      },
    ],
    plannedResources: [
      {
        resource: `${origin}/api/x402/intelligence`,
        method: "POST",
        product: CANONICAL_PRODUCT,
        provider: "coinbase_x402",
        pricing: "runtime_402_challenge_only",
        production_enabled: activeProviders.has("coinbase_x402"),
      },
      {
        resource: `${origin}/api/x402/circle/intelligence`,
        method: "POST",
        product: CANONICAL_PRODUCT,
        provider: "circle_gateway_x402",
        pricing: "runtime_402_challenge_only",
        production_enabled: activeProviders.has("circle_gateway_x402"),
        approved_initial_mainnet_network: "eip155:8453",
        arc_mainnet_enabled: false,
      },
      {
        resource: `${origin}/api/x402/nevermined/intelligence`,
        method: "POST",
        product: CANONICAL_PRODUCT,
        provider: "nevermined",
        pricing: "provider_plan_runtime_only",
        production_enabled: activeProviders.has("nevermined"),
      },
    ],
    discovery: {
      openapi: `${origin}/openapi-x402.json`,
      commerce: `${origin}/.well-known/geomacro-commerce.json`,
      agent: `${origin}/.well-known/geomacro-agent.json`,
      llms: `${origin}/llms.txt`,
    },
    runtimeSafety: {
      coordinated_launch_authorized: launch.authorized,
      emergency_freeze_active: launch.emergencyFrozen,
      quarantined_providers: launch.disabledProviders,
    },
    boundaries: {
      execution_authorized: false,
      wallet_custody: false,
      transaction_signing: false,
      raw_private_warehouse_delivery: false,
    },
  };
}

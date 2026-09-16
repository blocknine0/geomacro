import {
  coinbaseX402PaymentRequirements,
  getCoinbaseX402Config,
} from "./coinbase-x402.server";
import { providerRealFundsSecurityState } from "./provider-real-funds-security.server";

const CANONICAL_PRODUCT = "geomacro_adaptive_risk_intelligence_v1" as const;

export function buildX402DiscoveryDocument(originInput: string) {
  const origin = originInput.replace(/\/$/, "");
  const state = providerRealFundsSecurityState();
  const resources: Array<Record<string, unknown>> = [];

  if (state.providers.coinbase_mainnet && state.ready) {
    try {
      const config = getCoinbaseX402Config();
      if (config?.environment === "production") {
        resources.push({
          resource: `${origin}/api/x402/intelligence`,
          method: "POST",
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
      }
    } catch {
      // Fail closed. A half-configured production rail must never be advertised.
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
        pricing: "runtime_402_challenge_only",
        production_enabled: resources.length > 0,
      },
      {
        resource: `${origin}/api/x402/nevermined/intelligence`,
        method: "POST",
        product: CANONICAL_PRODUCT,
        provider: "nevermined",
        pricing: "provider_plan_runtime_only",
        production_enabled: state.providers.nevermined_live && state.ready,
      },
    ],
    discovery: {
      openapi: `${origin}/openapi-x402.json`,
      commerce: `${origin}/.well-known/geomacro-commerce.json`,
      agent: `${origin}/.well-known/geomacro-agent.json`,
      llms: `${origin}/llms.txt`,
    },
    boundaries: {
      execution_authorized: false,
      wallet_custody: false,
      transaction_signing: false,
      raw_private_warehouse_delivery: false,
    },
  };
}

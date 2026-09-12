import {
  defineEventHandler,
  getRequestHeaders,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
} from "../../../src/lib/commercial-access.server";
import {
  STRUCTURED_DATA_REGISTRY_VERSION,
} from "../../../src/lib/structured-data-entitlement-registry";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  TESTNET_API_PRICING_VERSION,
} from "../../../src/lib/testnet-api-pricing";
import {
  TESTNET_INTELLIGENCE_API_VERSION,
  TESTNET_INTELLIGENCE_CAPABILITIES,
  TESTNET_INTELLIGENCE_CAPABILITY_CATALOG,
  TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
  TESTNET_INTELLIGENCE_PRICE_TABLE,
} from "../../../src/lib/testnet-intelligence-contract";
import {
  requireTestnetUsdcReceiver,
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_DURATION_DAYS,
} from "../../../src/lib/testnet-usdc-access-contract";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);

  try {
    const authRequest = new Request(
      "https://geomacro.local/api/testnet/account",
      { headers: getRequestHeaders(event) },
    );
    const principal = await authenticateCommercialApiRequest(authRequest);
    const entitlement = await resolveCommercialEntitlementForCapability({
      principal,
      capability: "gri_read",
    });

    if (entitlement.tier !== "testnet_tester") {
      throw new CommercialAccessError(
        403,
        "TESTNET_TESTER_ENTITLEMENT_REQUIRED",
        "This endpoint is restricted to the Testnet tester entitlement.",
      );
    }

    const account = asRecord(
      await ensureCommercialCreditAccount({
        principal,
        tier: entitlement.tier,
      }),
    );

    return {
      ok: true,
      data: {
        api_version: TESTNET_INTELLIGENCE_API_VERSION,
        registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
        pricing_version: TESTNET_API_PRICING_VERSION,
        principal: {
          key_id: principal.key_id,
          type: principal.principal_type,
        },
        entitlement: {
          grant_id: entitlement.grant_id,
          offer_id: entitlement.policy.offer_id,
          tier: entitlement.tier,
          status: "active",
        },
        credit_account: {
          account_id: account.account_id ?? null,
          included_credits: account.included_credits ?? TESTNET_API_FIXED_CREDITS,
          credits_used: account.credits_used ?? null,
          credits_remaining: account.credits_remaining ?? null,
          period_started_at: account.period_started_at ?? null,
          period_ends_at: account.period_ends_at ?? null,
          status: account.status ?? null,
          contract_version: account.contract_version ?? null,
        },
        pricing: {
          payment_model: "pay_per_call",
          upfront_payment_required: false,
          credit_price_testnet_usdc: TESTNET_API_CREDIT_PRICE_USDC,
          max_credits_per_30_days: TESTNET_API_FIXED_CREDITS,
          duration_days: TESTNET_USDC_ACCESS_DURATION_DAYS,
          capability_prices: TESTNET_INTELLIGENCE_PRICE_TABLE,
        },
        payment: {
          receiver_address: requireTestnetUsdcReceiver(),
          supported_chains: Object.values(TESTNET_USDC_ACCESS_CHAINS),
          environment: "testnet",
          commercial_revenue: false,
        },
        capabilities: TESTNET_INTELLIGENCE_CAPABILITIES,
        capability_catalog: TESTNET_INTELLIGENCE_CAPABILITY_CATALOG,
        boundaries: TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
      },
    };
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      setResponseStatus(event, error.status);
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
        boundaries: TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
      };
    }

    console.error("[testnet-account-api] request failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: {
        code: "TESTNET_ACCOUNT_UNAVAILABLE",
        message: "Testnet API account status is temporarily unavailable.",
      },
      boundaries: TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES,
    };
  }
});

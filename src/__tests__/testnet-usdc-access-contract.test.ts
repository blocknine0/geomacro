import { describe, expect, it } from "vitest";

import {
  TESTNET_USDC_ACCESS_BOUNDARIES,
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_CREDITS,
  TESTNET_USDC_ACCESS_DURATION_DAYS,
  TESTNET_USDC_ACCESS_OFFER_ID,
  TESTNET_USDC_ACCESS_PRICE_ATOMIC,
  TESTNET_USDC_ACCESS_PRICE_USDC,
  TESTNET_USDC_RECEIVER_ENV,
} from "../lib/testnet-usdc-access-contract";
import {
  TESTNET_API_CREDIT_PRICE_ATOMIC,
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  testnetApiCallPriceAtomic,
  testnetApiCallPriceUsdc,
} from "../lib/testnet-api-pricing";
import {
  COMMERCIAL_OFFER_REGISTRY,
  STRUCTURED_TIER_REGISTRY,
} from "../lib/structured-data-entitlement-registry";

describe("multichain Testnet USDC developer access", () => {
  it("uses 0.5 Testnet USDC per credit with a 500-credit cap and no upfront purchase", () => {
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.free_access).toBe(false);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.payment_required).toBe(true);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.payment_model).toBe("pay_per_call");
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.upfront_payment_required).toBe(false);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.payment_is_real_revenue).toBe(false);
    expect(TESTNET_API_CREDIT_PRICE_USDC).toBe(0.5);
    expect(TESTNET_API_CREDIT_PRICE_ATOMIC).toBe(500_000n);
    expect(TESTNET_API_FIXED_CREDITS).toBe(500);
    expect(TESTNET_USDC_ACCESS_PRICE_USDC).toBe("0.5");
    expect(TESTNET_USDC_ACCESS_PRICE_ATOMIC).toBe(500_000n);
    expect(TESTNET_USDC_ACCESS_CREDITS).toBe(500);
    expect(TESTNET_USDC_ACCESS_DURATION_DAYS).toBe(30);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.credits_per_30_days).toBe(500);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.credit_price_usdc).toBe("0.5");
    expect(testnetApiCallPriceUsdc(3)).toBe(1.5);
    expect(testnetApiCallPriceAtomic(12)).toBe(6_000_000n);
  });

  it("supports only Arc Testnet, Base Sepolia and Polygon Amoy", () => {
    expect(Object.keys(TESTNET_USDC_ACCESS_CHAINS)).toEqual([
      "arcTestnet",
      "baseSepolia",
      "polygonAmoy",
    ]);
    for (const chain of Object.values(TESTNET_USDC_ACCESS_CHAINS)) {
      expect(chain.payment_asset).toBe("USDC");
      expect(chain.decimals).toBe(6);
      expect(chain.environment).toBe("testnet");
      expect(chain.revenue_classification).toBe("testnet_non_revenue");
      expect(chain.usdc_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("maps the wallet-verified tester into a bounded metered entitlement", () => {
    expect(TESTNET_USDC_ACCESS_OFFER_ID).toBe("testnet_tester_metered_30d");
    expect(COMMERCIAL_OFFER_REGISTRY.testnet_tester_metered_30d).toMatchObject({
      tier: "testnet_tester",
      payment_required: true,
      payment_model: "pay_per_call",
      upfront_payment_required: false,
      entitlement_kind: "testnet_metered_access",
    });
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.api_access).toBe(true);
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.max_subjects_per_request).toBe(1);
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.max_structural_observations).toBe(8);
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.signed_risk_objects).toBe(true);
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.risk_gate).toBe(true);
  });

  it("never exposes upstream news-source identity", () => {
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.upstream_news_source_identity_exposed).toBe(false);
    expect(STRUCTURED_TIER_REGISTRY.testnet_tester.upstream_news_source_identity_exposed).toBe(false);
  });

  it("uses one dedicated receiving-wallet environment setting", () => {
    expect(TESTNET_USDC_RECEIVER_ENV).toBe("TESTNET_USDC_RECEIVER_ADDRESS");
  });
});

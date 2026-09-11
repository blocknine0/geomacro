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
  COMMERCIAL_OFFER_REGISTRY,
  STRUCTURED_TIER_REGISTRY,
} from "../lib/structured-data-entitlement-registry";

describe("paid multichain testnet USDC tester access", () => {
  it("requires 0.5 Testnet USDC for a fixed 500-credit quota and never counts testnet settlement as revenue", () => {
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.free_access).toBe(false);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.payment_required).toBe(true);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.payment_is_real_revenue).toBe(false);
    expect(TESTNET_USDC_ACCESS_PRICE_USDC).toBe("0.50");
    expect(TESTNET_USDC_ACCESS_PRICE_ATOMIC).toBe(500_000n);
    expect(TESTNET_USDC_ACCESS_CREDITS).toBe(500);
    expect(TESTNET_USDC_ACCESS_DURATION_DAYS).toBe(30);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.credits_per_quota).toBe(500);
    expect(TESTNET_USDC_ACCESS_BOUNDARIES.quota_price_usdc).toBe("0.50");
  });

  it("supports the configured multichain testnets", () => {
    expect(Object.keys(TESTNET_USDC_ACCESS_CHAINS)).toEqual([
      "arcTestnet",
      "ethSepolia",
      "baseSepolia",
      "polygonAmoy",
      "arbitrumSepolia",
      "opSepolia",
      "avalancheFuji",
      "unichainSepolia",
      "lineaSepolia",
    ]);
    for (const chain of Object.values(TESTNET_USDC_ACCESS_CHAINS)) {
      expect(chain.payment_asset).toBe("USDC");
      expect(chain.decimals).toBe(6);
      expect(chain.environment).toBe("testnet");
      expect(chain.revenue_classification).toBe("testnet_non_revenue");
      expect(chain.usdc_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("maps the pass into a bounded canonical tester entitlement", () => {
    expect(TESTNET_USDC_ACCESS_OFFER_ID).toBe("testnet_tester_pass_30d");
    expect(COMMERCIAL_OFFER_REGISTRY.testnet_tester_pass_30d).toMatchObject({
      tier: "testnet_tester",
      payment_required: true,
      entitlement_kind: "testnet_pass",
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

import { describe, expect, it } from "vitest";
import {
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_USDC,
  COINBASE_X402_TESTNET_NETWORK,
  COINBASE_X402_TESTNET_USDC,
} from "./coinbase-x402.server";
import { assessCoinbaseX402FacilitatorCapabilities } from "./coinbase-x402-readiness.server";

const credentials = {
  apiKeyId: "organizations/example/apiKeys/example",
  apiKeySecret: "configured-secret",
};

const currentFacilitatorPayload = {
  kinds: [
    { x402Version: 2, scheme: "exact", network: "eip155:8453" },
    { x402Version: 2, scheme: "exact", network: "eip155:84532" },
    { x402Version: 2, scheme: "upto", network: "eip155:8453" },
    { x402Version: 1, scheme: "exact", network: "base" },
  ],
  extensions: ["bazaar", "eip2612GasSponsoring"],
};

describe("Coinbase x402 facilitator readiness", () => {
  it("accepts the documented v2 exact Base mainnet capability with Bazaar", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      currentFacilitatorPayload,
      {
        environment: "production",
        network: COINBASE_X402_MAINNET_NETWORK,
        asset: COINBASE_X402_MAINNET_USDC,
        ...credentials,
      },
    );

    expect(result).toEqual({
      ready: true,
      settlement_capability_ready: true,
      bazaar_extension_advertised: true,
      production_binding_ready: true,
      reason_codes: [],
    });
  });

  it("also recognizes the documented Base Sepolia v2 exact capability", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      currentFacilitatorPayload,
      {
        environment: "testnet",
        network: COINBASE_X402_TESTNET_NETWORK,
        asset: COINBASE_X402_TESTNET_USDC,
        ...credentials,
      },
    );
    expect(result.ready).toBe(true);
  });

  it("fails closed when only the legacy v1 Base capability exists", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      {
        kinds: [{ x402Version: 1, scheme: "exact", network: "base" }],
        extensions: ["bazaar"],
      },
      {
        environment: "production",
        network: COINBASE_X402_MAINNET_NETWORK,
        asset: COINBASE_X402_MAINNET_USDC,
        ...credentials,
      },
    );

    expect(result.ready).toBe(false);
    expect(result.reason_codes).toContain("FACILITATOR_V2_EXACT_NETWORK_UNSUPPORTED");
  });

  it("requires Bazaar advertisement for marketplace readiness", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      { kinds: currentFacilitatorPayload.kinds, extensions: [] },
      {
        environment: "production",
        network: COINBASE_X402_MAINNET_NETWORK,
        asset: COINBASE_X402_MAINNET_USDC,
        ...credentials,
      },
    );

    expect(result.settlement_capability_ready).toBe(true);
    expect(result.ready).toBe(false);
    expect(result.reason_codes).toContain("FACILITATOR_BAZAAR_EXTENSION_NOT_ADVERTISED");
  });

  it("rejects a production configuration not bound to canonical Base USDC", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      currentFacilitatorPayload,
      {
        environment: "production",
        network: COINBASE_X402_MAINNET_NETWORK,
        asset: "0x1111111111111111111111111111111111111111",
        ...credentials,
      },
    );

    expect(result.ready).toBe(false);
    expect(result.reason_codes).toContain("PRODUCTION_BASE_USDC_BINDING_INVALID");
  });

  it("requires authenticated facilitator credentials", () => {
    const result = assessCoinbaseX402FacilitatorCapabilities(
      currentFacilitatorPayload,
      {
        environment: "production",
        network: COINBASE_X402_MAINNET_NETWORK,
        asset: COINBASE_X402_MAINNET_USDC,
        apiKeyId: null,
        apiKeySecret: null,
      },
    );

    expect(result.ready).toBe(false);
    expect(result.reason_codes).toContain("CDP_API_CREDENTIALS_MISSING");
  });
});

import { describe, expect, it } from "vitest";
import { COINBASE_BAZAAR_RESOURCE_URL, matchCoinbaseBazaarResource } from "./coinbase-bazaar-status.server";

describe("Coinbase Bazaar catalog matching", () => {
  it("matches the exact Geomacro resource and returns only bounded catalog metadata", () => {
    const result = matchCoinbaseBazaarResource(
      {
        resources: [
          {
            resource: COINBASE_BAZAAR_RESOURCE_URL,
            serviceName: "Geomacro",
            lastUpdated: "2026-09-15T05:06:25.000Z",
            description: "risk service",
            secret: "must-not-escape",
          },
        ],
        partialResults: false,
        searchMethod: "text",
      },
      COINBASE_BAZAAR_RESOURCE_URL,
    );

    expect(result).toEqual({
      indexed: true,
      resource: COINBASE_BAZAAR_RESOURCE_URL,
      last_updated: "2026-09-15T05:06:25.000Z",
      service_name: "Geomacro",
      search_method: "text",
      partial_results: false,
    });
    expect(result).not.toHaveProperty("secret");
  });

  it("does not treat a sibling resource as the Geomacro risk endpoint", () => {
    const result = matchCoinbaseBazaarResource(
      {
        resources: [
          { resource: "https://geomacro.live/api/x402/other" },
          { resource: "https://example.com/api/x402/risk" },
        ],
      },
      COINBASE_BAZAAR_RESOURCE_URL,
    );

    expect(result.indexed).toBe(false);
    expect(result.last_updated).toBeNull();
    expect(result.service_name).toBeNull();
  });

  it("normalizes a trailing slash but does not ignore query or host identity", () => {
    expect(
      matchCoinbaseBazaarResource(
        { resources: [{ resource: `${COINBASE_BAZAAR_RESOURCE_URL}/` }] },
        COINBASE_BAZAAR_RESOURCE_URL,
      ).indexed,
    ).toBe(true);

    expect(
      matchCoinbaseBazaarResource(
        { resources: [{ resource: "https://other.example/api/x402/risk" }] },
        COINBASE_BAZAAR_RESOURCE_URL,
      ).indexed,
    ).toBe(false);
  });
});

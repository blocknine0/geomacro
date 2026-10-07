import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyCentralSecurityRoute } from "../lib/central-security.server";

const canonicalRoute = readFileSync(
  "src/routes/api.v1.intelligence_.query.ts",
  "utf8",
);
const sharedEndpoint = readFileSync(
  "src/lib/mainnet-intelligence-endpoint.server.ts",
  "utf8",
);
const legacyRoute = readFileSync(
  "src/routes/api.x402.intelligence.ts",
  "utf8",
);
const discovery = readFileSync("src/lib/x402-discovery.server.ts", "utf8");
const openapi = JSON.parse(readFileSync("public/openapi-x402.json", "utf8")) as any;
const agent = JSON.parse(
  readFileSync("public/.well-known/geomacro-agent.json", "utf8"),
) as any;
const commerce = JSON.parse(
  readFileSync("public/.well-known/geomacro-commerce.json", "utf8"),
) as any;
const disposition = JSON.parse(
  readFileSync("config/commercial-route-disposition.json", "utf8"),
) as any;

const CANONICAL = "/api/v1/intelligence/query";
const LEGACY = "/api/x402/intelligence";

describe("Geomacro Mainnet Intelligence API v1", () => {
  it("mounts the canonical endpoint on the exact same handler as the legacy x402 alias", () => {
    expect(canonicalRoute).toContain("CANONICAL_MAINNET_INTELLIGENCE_PATH");
    expect(canonicalRoute).toContain("mainnetIntelligenceHandlers");
    expect(sharedEndpoint).toContain(
      'export const CANONICAL_MAINNET_INTELLIGENCE_PATH = "/api/v1/intelligence/query"',
    );
    expect(sharedEndpoint).toContain(
      'export const LEGACY_X402_INTELLIGENCE_PATH = "/api/x402/intelligence"',
    );
    expect(sharedEndpoint).toContain("export const mainnetIntelligenceHandlers");
    expect(legacyRoute).toContain("mainnetIntelligenceHandlers");
    expect(legacyRoute).toContain('createFileRoute("/api/x402/intelligence")');
  });

  it("keeps canonical v1 behind the same fail-closed real-funds security class", () => {
    expect(classifyCentralSecurityRoute(CANONICAL, "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute(LEGACY, "POST")).toBe("payment");
    expect(disposition.routes[CANONICAL]).toEqual({
      classification: "PRODUCTION",
      status: "CONTROLLED_PRELAUNCH",
    });
  });

  it("publishes the canonical endpoint consistently across machine discovery", () => {
    expect(openapi.paths[CANONICAL]).toBeTruthy();
    expect(discovery).toContain("/api/v1/intelligence/query");
    expect(agent.delivery.canonical_paid_endpoint).toBe(
      "https://geomacro.live/api/v1/intelligence/query",
    );
    expect(commerce.offers[0].providers.coinbase_x402.endpoint).toBe(
      "https://geomacro.live/api/v1/intelligence/query",
    );
  });

  it("preserves the no-raw, non-executing, hashed commercial boundary", () => {
    for (const marker of [
      "sanitizeAndRehashPaidPreparedResponse",
      "assertPublicPaidOutputBoundary",
      "assertGeomacroIntelligenceResponseContract",
      "delivered_product_hash",
      "execution_authorized: false",
      "claimCoinbaseX402Delivery",
      "completeCoinbaseX402Delivery",
    ]) {
      expect(sharedEndpoint).toContain(marker);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare Workers Caching configuration", () => {
  it("enables cache lookups for the deployed control-plane Worker", () => {
    const config = JSON.parse(
      readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8"),
    ) as { cache?: { enabled?: boolean } };

    // Cache-Control response headers alone do not activate Workers Caching.
    // The cache must be enabled in the exact config used by the protected deploy.
    expect(config.cache?.enabled).toBe(true);
  });
});

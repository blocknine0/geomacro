import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("server/api/public/intelligence.get.ts", "utf8");

describe("public Intelligence freshness cache contract", () => {
  it("prevents CDN or surrogate stale-while-revalidate from hiding a newer verified B2 package", () => {
    expect(route).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(route).toContain('"CDN-Cache-Control": "no-store"');
    expect(route).toContain('"Surrogate-Control": "no-store"');
    expect(route).not.toContain("stale-while-revalidate");
  });
});

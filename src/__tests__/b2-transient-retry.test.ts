import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/ops/b2-s3-client.mjs", "utf8");

describe("B2 S3 transient retry contract", () => {
  it("retries only a bounded set of transient HTTP statuses", () => {
    expect(source).toContain("new Set([429, 500, 502, 503, 504])");
    expect(source).toContain("const MAX_ATTEMPTS = 4");
    expect(source).toContain("500 * 2 ** (attempt - 1)");
  });

  it("keeps signing inside each attempt so retry timestamps are fresh", () => {
    expect(source.indexOf("for (let attempt = 1; attempt <= maxAttempts; attempt++)"))
      .toBeLessThan(source.indexOf("const timestamp = new Date()"));
  });

  it("still fails closed after retry exhaustion", () => {
    expect(source).toContain("attempt === maxAttempts");
    expect(source).toContain("B2_${method}_RETRY_EXHAUSTED");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ops/b2-fragment-targeted-cleanup.mjs",
  "utf8",
);

describe("targeted fragment cleanup legacy path support", () => {
  it("accepts only canonical live/v1 and fragments/v1 gzip fragment paths", () => {
    expect(script).toContain("(?:live|fragments)\\/v1");
    expect(script).toContain("sourcePath.includes(\"..\")");
    expect(script).toContain("B2_FRAGMENT_TARGET_METADATA_INVALID");
  });

  it("keeps destructive cleanup gated by handled completeness", () => {
    expect(script).toContain("const eligible = handled.total >= manifest.itemCount");
    expect(script).toContain("B2_FRAGMENT_TARGET_UNPROCESSED_RECORDS");
    expect(script).toContain("await storage.remove([manifest.sourcePath])");
  });
});

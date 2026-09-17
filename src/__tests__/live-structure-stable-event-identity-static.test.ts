import { describe, expect, it } from "vitest";
import fs from "node:fs";

const patch = fs.readFileSync(
  "scripts/patch-live-structure-private-error-serializer.mjs",
  "utf8",
);

const deploy = fs.readFileSync(
  ".github/workflows/deploy-live-structure-intelligence.yml",
  "utf8",
);

describe("live structure stable event identity", () => {
  it("resolves an exact canonical story before allocating a replacement event id", () => {
    expect(patch).toContain('"canonical_story_lookup"');
    expect(patch).toContain('"story_key"');
    expect(patch).toContain(".maybeSingle()");
    expect(patch).toContain("canonicalStory.id");
    expect(patch).toContain("evidenceCount");
    expect(patch).toContain("firstSeenAt");
    expect(patch).toContain("sourceFamilies");
  });

  it("keeps the production deployment contract pinned to the canonical identity patch", () => {
    expect(deploy).toContain("canonical_story_lookup");
    expect(deploy).toContain("canonicalStory.id");
    expect(deploy).toContain("Apply deterministic runtime hardening patch");
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";

const runtimePath =
  "supabase/functions/live-structure-intelligence/index.ts";
const deployPath =
  ".github/workflows/deploy-live-structure-intelligence.yml";

describe("live structure stable event identity", () => {
  it("permanently resolves an exact canonical story before allocating a replacement event id", () => {
    const runtime = fs.readFileSync(runtimePath, "utf8");

    const canonicalLookupIndex =
      runtime.indexOf("phase =\n            'canonical_story_lookup'");
    const randomIdIndex =
      runtime.indexOf("id: crypto.randomUUID()", canonicalLookupIndex);

    expect(canonicalLookupIndex).toBeGreaterThanOrEqual(0);
    expect(randomIdIndex).toBeGreaterThan(canonicalLookupIndex);
    expect(runtime).toContain(".eq('story_key', storyKey)");
    expect(runtime).toContain(".maybeSingle()");
    expect(runtime).toContain("throw canonicalStoryError;");
    expect(runtime).toContain("lastObservedAt");
  });

  it("keeps the permanent runtime free of generated patch dependencies", () => {
    const runtime = fs.readFileSync(runtimePath, "utf8");
    const deploy = fs.readFileSync(deployPath, "utf8");

    expect(runtime).not.toContain(
      "patch-live-structure-private-error-serializer",
    );
    expect(runtime).not.toContain(
      "patch-live-structure-runtime",
    );
    expect(deploy).not.toContain(
      "patch-live-structure-private-error-serializer",
    );
    expect(deploy).not.toContain(
      "patch-live-structure-runtime",
    );
    expect(deploy).toContain(
      "live-structure-v1.4.9",
    );
  });
});

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publisherPath = "scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs";

describe("public Intelligence publisher parse contract", () => {
  it("parses cleanly under the pinned Bun runtime", () => {
    const result = spawnSync("bun", ["--check", publisherPath], { encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});

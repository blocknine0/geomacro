import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const publisherPath = "scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs";

describe("public Intelligence publisher parse contract", () => {
  it("parses cleanly under the pinned Bun runtime without executing production code", () => {
    const dir = mkdtempSync(join(tmpdir(), "geomacro-publisher-parse-"));
    try {
      const result = spawnSync(
        "bun",
        ["build", publisherPath, "--target=bun", "--outfile", join(dir, "publisher.js")],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr || result.stdout).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

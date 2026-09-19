import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GDELT GAL cursor health semantics", () => {
  it("records a successful no-new-file cycle as a success", () => {
    const script = readFileSync(
      "scripts/sync-gdelt-gal-production.mjs",
      "utf8",
    );

    const marker = 'status: "no_new_gdelt_file"';
    const index = script.indexOf(marker);
    expect(index).toBeGreaterThanOrEqual(0);

    const block = script.slice(Math.max(0, index - 1800), index + 300);
    expect(block).toContain('status: "healthy"');
    expect(block).toContain("last_attempt_at: nowIso");
    expect(block).toContain("last_success_at: nowIso");
    expect(block).toContain("consecutive_failures: 0");
  });
});

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("independent no-funds first buyer journey contract", () => {
  it("passes all runtime and adversarial node fixtures without wallet or paid request", () => {
    const run = spawnSync("node", [
      "--test",
      "scripts/agentic/verify-first-earning-separate-live.test.mjs",
    ], { encoding:"utf8", timeout:25_000, maxBuffer:1_000_000 });
    expect(run.status, run.stdout+"\n"+run.stderr).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("continuous public and testnet E2E contract", () => {
  it("accepts the configured prelaunch x402 503 only when it is fail-closed", () => {
    const workflow = read(".github/workflows/continuous-public-testnet-e2e.yml");
    expect(workflow).toContain("503)");
    expect(workflow).toContain('.error.code == "X402_NOT_CONFIGURED"');
    expect(workflow).toContain(".execution_authorized == false");
    expect(workflow).toContain("display_score|raw_score|risk_object|payment_event_id|credits_remaining");
    expect(workflow).not.toContain('401|402) ;;');
  });
});

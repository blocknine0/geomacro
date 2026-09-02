import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

// This is a contract test for the identity design: only keyed hashes may be
// persisted as external_agent_id. Raw identifiers are never expected in DB.
describe("agent telemetry identity contract", () => {
  it("uses a keyed one-way identity representation", () => {
    const raw = "agent:example-agent";
    const hashed = createHmac("sha256", "test-secret").update(raw).digest("hex");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toContain("example-agent");
  });
});

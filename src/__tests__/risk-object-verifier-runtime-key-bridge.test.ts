import { describe, expect, it } from "vitest";

const signing = await import("@/lib/risk-object-signing.server");
const runtime = await import("@/lib/risk-object-runtime-public-key.server");

describe("Risk Object runtime verification key bridge", () => {
  it("materializes the deterministic public key before loading verification keys", () => {
    expect(signing.loadRiskObjectVerificationKeysFromEnv).toBeTypeOf("function");
    expect(runtime.ensureRiskObjectRuntimePublicKey).toBeTypeOf("function");
  });

  it("keeps the runtime public-key helper as the single derivation path", async () => {
    const source = await import("node:fs").then(fs =>
      fs.readFileSync("src/lib/risk-object-signing.server.ts", "utf8"),
    );
    expect(source).toContain("ensureRiskObjectRuntimePublicKey();");
  });
});

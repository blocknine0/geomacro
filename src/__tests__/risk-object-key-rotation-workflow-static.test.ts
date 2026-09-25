import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Risk Object key rotation workflows", () => {
  it("does not pin republish to a retired key generation", () => {
    const workflow = read(".github/workflows/republish-country-risk-object-key-rotation.yml");

    expect(workflow).toContain("RISK_OBJECT_SIGNING_KEY_ID: ${{ secrets.RISK_OBJECT_SIGNING_KEY_ID }}");
    expect(workflow).toContain("result?.integrity?.signing_key_id !== process.env.RISK_OBJECT_SIGNING_KEY_ID");
    expect(workflow).not.toContain("EXPECTED_KEY_ID: geomacro-risk-2026-02");
    expect(workflow).not.toContain("geomacro-risk-2026-02");
  });

  it("derives the verifier key for the configured active generation", () => {
    const workflow = read(".github/workflows/derive-risk-object-public-key.yml");

    expect(workflow).toContain("RISK_OBJECT_SIGNING_KEY_ID: ${{ secrets.RISK_OBJECT_SIGNING_KEY_ID }}");
    expect(workflow).toContain("const keyId = process.env.RISK_OBJECT_SIGNING_KEY_ID;");
    expect(workflow).not.toContain("EXPECTED_KEY_ID: geomacro-risk-2026-02");
    expect(workflow).not.toContain("geomacro-risk-2026-02");
  });
});

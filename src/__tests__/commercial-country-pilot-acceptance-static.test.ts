import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL(
    "../../.github/workflows/commercial-country-pilot-acceptance.yml",
    import.meta.url,
  ),
  "utf8",
);

describe("commercial country pilot acceptance workflow", () => {
  it("pins production authority and current signing key", () => {
    expect(workflow).toContain("EXPECTED_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(workflow).toContain("EXPECTED_KEY_ID: geomacro-risk-2026-02");
    expect(workflow).toContain("environment: production");
  });

  it("requires verified signed country GROs before Risk Gate proof", () => {
    expect(workflow).toContain("commercial_eligibility?.status !== 'VERIFIED'");
    expect(workflow).toContain("verification?.status !== 'VERIFIED'");
    expect(workflow).toContain("signature_valid !== true");
    expect(workflow).toContain("context?.published !== true");
  });

  it("preserves the derived-only delivery restriction", () => {
    expect(workflow).toContain("commercial_source_derived_only");
    expect(workflow).toContain("derived_only_delivery_no_raw_redistribution");
    expect(workflow).toContain("raw publisher content is not redistributed");
  });

  it("proves auth, idempotent replay and conflict without execution authority", () => {
    expect(workflow).toContain("X-Geomacro-Idempotent-Replay");
    expect(workflow).toContain("IDEMPOTENCY_CONFLICT");
    expect(workflow).toContain("execution_authorized == false");
    expect(workflow).toContain("execution_authorized:false");
  });

  it("keeps corridor validation outside the country acceptance gate", () => {
    expect(workflow).toContain("corridor_methodology_verified:false");
    expect(workflow).toContain("Corridor v0.1 remains a separate unverified pilot methodology.");
    expect(workflow).not.toContain("publish-corridor-risk-object");
  });

  it("does not touch GOAT or payment authorization", () => {
    expect(workflow).not.toContain("GOAT_TESTNET3_USDC");
    expect(workflow).not.toContain("x402");
  });
});

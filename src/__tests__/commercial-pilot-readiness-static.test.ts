import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/051_internal_handoff_source_rights_resolution.sql",
    import.meta.url,
  ),
  "utf8",
);

const workflow = readFileSync(
  new URL(
    "../../.github/workflows/commercial-pilot-readiness.yml",
    import.meta.url,
  ),
  "utf8",
);

const report = readFileSync(
  new URL(
    "../../scripts/commercial-pilot-readiness-report.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("commercial pilot readiness bundle", () => {
  it("resolves internal handoff rights only through narrow reviewed URL policy", () => {
    expect(migration).toContain("live_source_url_commercial_policy");
    expect(migration).toContain("INTERNAL_INHERIT_ONLY");
    expect(migration).toContain("required_url_fragment");
    expect(migration).toContain("source=2");
    expect(migration).toContain("https://api.unhcr.org/population/v1/");
    expect(migration).toContain("https://ucdpapi.pcr.uu.se/api/gedevents/");
  });

  it("keeps missing or review-required rights fail closed", () => {
    expect(migration).toContain("then 'UNVERIFIED'");
    expect(migration).toContain("commercial_source_review_required");
    expect(migration).toContain("missing_commercial_source_policy");
    expect(migration).toContain("commercial_source_derived_only");
  });

  it("keeps policy and rights views service-role only", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("keeps the readiness workflow read only and payment free", () => {
    expect(workflow).toContain("Generate read-only readiness evidence");
    expect(workflow).toContain("commercial-pilot-readiness-report.ts");
    expect(workflow).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64");
    expect(workflow).not.toContain("GOAT_TESTNET3_USDC");
    expect(workflow).not.toContain("publish-country-risk-object");
    expect(workflow).not.toContain("publish-corridor-risk-object");
  });

  it("pins the report to the authoritative project and execution false", () => {
    expect(report).toContain('AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(report).toContain("execution_authorized: false");
    expect(report).toContain("commercial_ready: commercialReady");
    expect(report).toContain("--require-verified");
  });
});

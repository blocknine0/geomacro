import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/intelligence-machine-current.yml", "utf8");
const publisher = readFileSync("scripts/ops/publish-machine-public-intelligence.mjs", "utf8");

describe("Machine Intelligence typed signed-ready repository dispatch", () => {
  it("requires protected main and exact event type + immutable SHA pointers", () => {
    for (const marker of [
      "repository_dispatch:",
      "types: [machine_intelligence_dual_signed_ready]",
      "workflow_dispatch:",
      "github.ref == 'refs/heads/main'",
      "github.event_name == 'workflow_dispatch'",
      "github.event_name == 'repository_dispatch'",
      "github.event.action == 'machine_intelligence_dual_signed_ready'",
      "github.event.client_payload.schema == 'geomacro.machine-intelligence-dual-signed-ready.v1'",
      "github.event.client_payload.machine_b2_key",
      "github.event.client_payload.machine_b2_sha256",
      "MACHINE_INTELLIGENCE_AUTHORITY_OR_PIN_INVALID",
    ]) expect(workflow).toContain(marker);
    expect(workflow).not.toMatch(/^\s+(?:schedule|push):/mu);
    expect(workflow).not.toContain("website-derived-news");
  });

  it("retains actual distinct Facts/Rights signatures, B2 quotas and D1 readback", () => {
    for (const marker of [
      "machineCommercialAuthorityConfigurationValid()",
      "geomacro-evidence/v1/private/machine-intelligence-current/",
      "MACHINE_INTELLIGENCE_B2_READBACK_MISMATCH",
      "GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256=",
      "publish-machine-public-intelligence.mjs --verified-publication",
      "verifyPublishedIntelligenceReadback",
      'B2_ACCOUNT_QUOTA_REQUIRED: "1"',
      "B2_ACCOUNT_QUOTA_WORKFLOW_ID: intelligence_machine_publication",
      'B2_REQUEST_BUDGET: "4"',
      'B2_REQUEST_BUDGET: "8"',
      "GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM",
      "GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM",
      "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
      "environment: production",
    ]) expect(workflow).toContain(marker);
    expect(workflow).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:");
    expect(workflow).not.toContain("COINBASE_API_KEY: ");
    expect(publisher).toContain("publishMachineIntelligence");
    expect(publisher).toContain("MACHINE_INTELLIGENCE_INPUT_HASH_MISMATCH");
    expect(publisher).toContain("machineCommercialAuthorityConfigurationValid()");
  });

  it("a news hint cannot certify upstream source rights or authorize money", () => {
    expect(workflow).not.toContain("github.event.client_payload.rights_approved");
    expect(workflow).not.toContain("github.event.client_payload.verified");
    expect(workflow).not.toContain("github.event.client_payload.rows");
    expect(workflow).not.toContain("publish-website-derived-news.ts");
  });
});

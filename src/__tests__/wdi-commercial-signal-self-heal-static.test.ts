import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ensure-world-bank-commercial-signal-state.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/wdi-commercial-signal-self-heal.yml",
  "utf8",
);

describe("WDI commercial signal self-heal", () => {
  it("targets only the authoritative app project and reviewed WDI source", () => {
    expect(script).toContain('EXPECTED_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(script).toContain('SOURCE_ID = "world_bank_indicators"');
    expect(script).toContain("NON_AUTHORITATIVE_SUPABASE_PROJECT");
  });

  it("fails closed unless reviewed source preconditions still hold", () => {
    expect(script).toContain('source.commercial_usage_status === "COMMERCIAL_OK"');
    expect(script).toContain("source.raw_redistribution_allowed === true");
    expect(script).toContain("source.attribution_required === true");
    expect(script).toContain("source.enabled_for_ingestion === true");
    expect(script).toContain("WDI_COMMERCIAL_SIGNAL_REPAIR_BLOCKED");
  });

  it("repairs only the commercial-signal operational flag", () => {
    expect(script).toContain("enabled_for_commercial_signals: true");
    expect(script).not.toMatch(/\.update\(\{[\s\S]*commercial_usage_status:/);
    expect(script).not.toMatch(/\.update\(\{[\s\S]*raw_redistribution_allowed:/);
    expect(script).not.toMatch(/\.update\(\{[\s\S]*enabled_for_ingestion:/);
    expect(script).toContain("rights_broadened: false");
    expect(script).toContain("mainnet_activation_changed: false");
    expect(script).toContain("execution_authorized: false");
  });

  it("runs before the hourly global readiness window and remains manually runnable", () => {
    expect(workflow).toContain('cron: "12 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("secrets.APP_SUPABASE_URL");
    expect(workflow).toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
  });
});

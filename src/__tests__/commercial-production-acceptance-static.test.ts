import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const provisioner = readFileSync(
  join(process.cwd(), "scripts/commercial/provision-commercial-api-pilot.ts"),
  "utf8",
);
const acceptance = readFileSync(
  join(process.cwd(), "scripts/commercial/accept-commercial-api.ts"),
  "utf8",
);
const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/commercial-api-production-acceptance.yml"),
  "utf8",
);

describe("commercial production acceptance tooling", () => {
  it("pins provisioning to the authoritative production project and never logs the raw API key", () => {
    expect(provisioner).toContain('AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(provisioner).toContain('api_key_hash_prefix');
    expect(provisioner).toContain('raw_api_key_logged: false');
    expect(provisioner).not.toContain('api_key: apiKey');
    expect(provisioner).not.toContain('console.log(apiKey');
  });

  it("is dry-run by default and refuses implicit access-state reactivation or term mutation", () => {
    expect(provisioner).toContain('process.argv.includes("--write")');
    expect(provisioner).toContain('Existing principal is not active; refusing implicit reactivation');
    expect(provisioner).toContain('Existing credential is disabled; refusing implicit re-enable');
    expect(provisioner).toContain('Entitlement reference conflict: refusing to change existing commercial terms');
    expect(provisioner).toContain('Existing entitlement is not currently active; refusing implicit renewal/reactivation');
  });

  it("proves exact replay, mutated replay and invalid auth against production", () => {
    expect(acceptance).toContain('"https://geomacro.live"');
    expect(acceptance).toContain('idempotent_replay !== true');
    expect(acceptance).toContain('IDEMPOTENCY_CONFLICT');
    expect(acceptance).toContain('Exact replay consumed credits twice');
    expect(acceptance).toContain('Invalid API key did not fail closed');
    expect(acceptance).toContain('execution_authorized boundary failed');
    expect(acceptance).toContain('raw_data_included boundary failed');
    expect(acceptance).toContain('private_warehouse_access boundary failed');
  });

  it("keeps production mutation manual-only and protected by the production environment", () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('COMMERCIAL_PILOT_API_KEY: ${{ secrets.COMMERCIAL_PILOT_API_KEY }}');
    expect(workflow).toContain("- dry_run");
    expect(workflow).toContain("- provision_and_verify");
    expect(workflow).toContain('provision-commercial-api-pilot.ts --write');
  });
});

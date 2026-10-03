import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-control-plane-d1.yml", "utf8");
const wrangler = readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8");

describe("D1 control-plane bootstrap", () => {
  it("reuses one named D1 database and applies the committed schema remotely", () => {
    expect(workflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(workflow).toContain("d1 list --json");
    expect(workflow).toContain('d1 create "$D1_DATABASE_NAME" --location apac');
    expect(workflow).toContain("d1 migrations apply DB --remote");
    expect(workflow).toContain("SELECT version FROM schema_meta");
  });

  it("uses direct pinned Wrangler rather than a repository package-manager installer", () => {
    expect(workflow).toContain('npx -y "wrangler@${WRANGLER_VERSION}" deploy');
    expect(workflow).toContain('secret put CONTROL_PLANE_TOKEN');
    expect(workflow).not.toContain("cloudflare/wrangler-action@");
    expect(workflow).not.toContain("packageManager:");
    expect(wrangler).toContain('"workers_dev": true');
  });

  it("keeps production secrets server-only and domain separates the control token", () => {
    expect(workflow).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(workflow).toContain("createHmac('sha256'");
    expect(workflow).toContain("geomacro-control-plane-v1");
    expect(workflow).toContain('echo "::add-mask::$CONTROL_PLANE_TOKEN"');
    expect(workflow).not.toContain("VITE_");
  });

  it("requires fail-closed live acceptance without activating payments or deleting legacy data", () => {
    expect(workflow).toContain('test "$CODE" = "401"');
    expect(workflow).toContain('test "$CODE" = "200"');
    expect(workflow).toContain('"durable_payload_store":"b2"');
    expect(workflow).toContain('"commerce_ledger":"durable_object"');
    expect(workflow).toContain("without touching x402 settlement");
    expect(workflow).toContain("Supabase deletion");
    expect(workflow).toContain("storage.objects SQL deletion");
    expect(workflow).toContain("B2 deletion");
  });
});

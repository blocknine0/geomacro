import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path: string) => readFileSync(path, "utf8");

describe("one-shot WDI B2 rights operator workflow safety", () => {
  it("runs dedicated synthetic no-network rights, quota and tamper tests", () => {
    const r = spawnSync(process.execPath,
      ["--test", "scripts/ops/verify-wdi-b2-rights-once.test.mjs"],
      {encoding:"utf8",timeout:15000,env:{...process.env,
        GEOMACRO_COMMERCE_LEDGER_TOKEN:"",B2_ARCHIVE_READ_KEY_ID:"",
        B2_ARCHIVE_READ_APPLICATION_KEY:"",CLOUDFLARE_API_TOKEN:""}});
    expect(r.status, String(r.stdout)+"\n"+String(r.stderr)).toBe(0);
  });

  it("cannot automatically run privileged secret-bearing job in PR", () => {
    const workflow=read(".github/workflows/wdi-b2-rights-one-shot-attestation.yml");
    expect(workflow).toMatch(/on:\s*\n\s*workflow_dispatch:\s*\{\}/);
    expect(workflow).not.toMatch(/^\s*(pull_request|push|schedule|workflow_run):/m);
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("node --test scripts/ops/verify-wdi-b2-rights-once.test.mjs");
    expect(workflow).not.toContain("SUPABASE_DB_URL:");
    expect(workflow).not.toContain("CLOUDFLARE_API_TOKEN:");
  });

  it("refuses direct B2 read without an accepted D1 reservation or a payment", () => {
    const source=read("scripts/ops/verify-wdi-b2-rights-once.mjs");
    const reserve=source.indexOf('QUOTA + "/v1/b2-quota/reserve"');
    const s3=source.indexOf('fetchImpl(details.url');
    expect(reserve).toBeGreaterThan(0);
    expect(s3).toBeGreaterThan(reserve);
    expect(source).toContain('WORKFLOW_ID = "wdi_rights_one_shot"');
    expect(source).toContain("fresh_d1_get_reserved:");
    expect(source).toContain("max_s3_get_attempts: 1");
    expect(source).toContain("payments: 0");
    expect(source).not.toContain("settleCoinbaseX402");
    expect(source).not.toContain("createClient(");
  });
});

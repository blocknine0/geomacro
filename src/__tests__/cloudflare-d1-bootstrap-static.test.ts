import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-d1-control-plane.yml", "utf8");
const wrangler = readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8");

describe("D1 control-plane bootstrap", () => {
  it("reuses one named D1 database and applies the committed schema remotely", () => {
    expect(workflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(workflow).toContain("DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS");
    expect(workflow).toContain("EXPLICIT_D1_CONTROL_PLANE_DEPLOY_CONFIRMATION_REQUIRED");
    expect(workflow).toContain("d1 list --json");
    expect(workflow).toContain('d1 create "$D1_DATABASE_NAME" --location apac');
    expect(workflow).toContain("d1 migrations apply DB --remote");
    expect(workflow).toContain("node scripts/ops/audit-d1-account-daily-quota-readonly.mjs");
    expect(workflow.indexOf("node scripts/ops/audit-d1-account-daily-quota-readonly.mjs"))
      .toBeLessThan(workflow.indexOf("d1 migrations apply DB --remote"));
    expect(workflow).toContain("id: d1-quota-preflight");
    expect(workflow).toContain("if: steps.d1-quota-preflight.outcome != 'success'");
    expect(workflow.indexOf("D1_QUOTA_HEADROOM_UNVERIFIED_OR_BELOW_SAFE_RESERVE"))
      .toBeLessThan(workflow.indexOf("d1 migrations apply DB --remote"));
    expect(workflow).toContain("SELECT version FROM schema_meta");
  });

  it("gates deployment on official account-wide daily D1 headroom before any migration query", () => {
    const quotaAudit = readFileSync("scripts/ops/audit-d1-account-daily-quota-readonly.mjs", "utf8");
    const quotaRecovery = readFileSync(".github/workflows/recover-d1-quota-deployment-after-reset.yml", "utf8");
    const preflight = workflow.indexOf("node scripts/ops/audit-d1-account-daily-quota-readonly.mjs");
    const migration = workflow.indexOf("d1 migrations apply DB --remote");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(migration).toBeGreaterThan(preflight);
    expect(quotaAudit).toContain("d1AnalyticsAdaptiveGroups");
    expect(quotaAudit).toContain("D1_FREE_DAILY");
    expect(quotaAudit).toContain("d1_writes:0");
    expect(quotaRecovery).toContain("daily row read limit");
    expect(quotaRecovery).toContain("daily row write limit");
    expect(quotaRecovery).toContain("DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS");
    expect(quotaRecovery).toContain('"confirmation":"DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS"');
  });

  it("routes one bounded complete journal bundle without the three-page OFFSET scan", () => {
    const index = readFileSync("workers/control-plane/src/index.mjs", "utf8");
    const reader = readFileSync("workers/control-plane/src/website-derived-intelligence.mjs", "utf8");
    const start = reader.indexOf("export async function readDerivedStoriesBundle");
    const end = reader.indexOf("export async function renderDerivedStoriesHtml", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const bundle = reader.slice(start, end);
    expect(index).toContain("/v1/public/website-derived-news-bundle");
    expect(index).toContain("readDerivedStoriesBundle(env)");
    expect(bundle).toContain("LIMIT 601");
    expect(bundle).not.toContain("OFFSET");
    expect(bundle).toContain("item_cap:600");
    expect(bundle).toContain("complete:true");
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

  it("retries only exact deployed SHA propagation before any authenticated D1 budget request",()=>{
    const verifier=readFileSync("scripts/ops/verify-d1-central-security-budget.mjs","utf8");
    expect(verifier).toContain("for(let attempt=1;attempt<=12;attempt++)");
    expect(verifier).toContain("health.data?.deployed_source_sha===sha");
    expect(verifier).toContain("SECURITY_ACCEPTANCE_HEALTH_UNEXPECTED_STATUS");
    expect(verifier).toContain("SECURITY_ACCEPTANCE_DEPLOY_SHA_MISMATCH");
    expect(verifier).toContain("setTimeout(resolve,4000)");
    expect(verifier.indexOf("health.data?.deployed_source_sha===sha"))
      .toBeLessThan(verifier.indexOf("const accepted=await request('/v1/security/budget',body)"));
  });
  it("reruns D1 security acceptance on verifier changes and redacts untrusted upstream replies",()=>{
    const verifier=readFileSync("scripts/ops/verify-d1-central-security-budget.mjs","utf8");
    expect(workflow).toContain('"scripts/ops/verify-d1-central-security-budget.mjs"');
    expect(verifier).toContain("geomacro.central-security-d1-acceptance-failure.v1");
    expect(verifier).toContain("NO_SAFE_ERROR_CODE");
    expect(verifier).toContain("SECURITY_ACCEPTANCE_D1_NOT_VERIFIED");
    expect(verifier).not.toContain("console.error(accepted.data)");
    expect(verifier).not.toContain("console.error(raw)");
  });
  it("requires fail-closed live acceptance and retries only the bounded workers.dev 1042 propagation case", () => {
    expect(workflow).toContain('test "$CODE" = "401"');
    expect(workflow).toContain('test "$CODE" = "200"');
    expect(workflow).toContain("error code: 1042");
    expect(workflow).toContain("retry $attempt/6");
    expect(workflow).toContain('"durable_payload_store":"b2"');
    expect(workflow).toContain('"commerce_ledger":"durable_object"');
    expect(workflow).toContain("without touching x402 settlement");
    expect(workflow).toContain("Supabase deletion");
    expect(workflow).toContain("storage.objects SQL deletion");
    expect(workflow).toContain("B2 deletion");
  });
});

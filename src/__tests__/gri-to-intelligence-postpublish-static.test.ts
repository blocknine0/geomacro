import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

const workflow=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
const bridge=readFileSync("scripts/lib/gri-reviewed-to-current-intelligence.mjs","utf8");
const cli=readFileSync("scripts/ops/prepare-intelligence-from-reviewed-gri.mjs","utf8");
const continuation=workflow.split("  independent-intelligence-continuation:\n")[1];

describe("independent signed GRI -> current scored Intelligence production continuation",()=>{
  it("starts ONLY following genuine successful reviewed GRI, independently of risk-indices success",()=>{
    expect(continuation).toBeTruthy();
    for(const s of [
      "needs: [verified-current]","needs.verified-current.result == 'success'",
      "github.ref == 'refs/heads/main'","continue-on-error: true",
      "environment: production","timeout-minutes: 15",
    ])expect(continuation).toContain(s);
    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("gri_reviewed_current_ready");
  });
  it("requires pinned external signed GRI and same independently approved reviewer",()=>{
    for(const s of [
      "geomacro-evidence/v1/private/reviewed-gri-current/",
      "GRI_INTELLIGENCE_REVIEWED_B2_SHA_MISMATCH",
      "GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:",
      "GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:",
      "Resolve shared D1 account B2 quota governor",
    ])expect(continuation).toContain(s);
    for(const s of [
      "preflightReviewedCurrentGlobalRisk({",
      "qualifyIndependentSameEvent({",
      "reviewed.signed_input",
      "verified.receipt.commercial_event_admission!==true",
      "CURRENT_SIX_HOUR_THREE_DOMAIN_ORIGINALS_MISSING",
    ])expect(bridge).toContain(s);
  });
  it("cannot rebrand GRI 72h retained events into 6h customer Intel",()=>{
    expect(bridge).toContain("const MAX_INTELLIGENCE_AGE_MS=6*60*60*1000;");
    expect(bridge).toContain("now.getTime()-published>MAX_INTELLIGENCE_AGE_MS");
    expect(bridge).toContain("ALL_DOMAINS.every(category=>rows.some");
    expect(continuation).toContain("steps.candidate.outputs.ready == 'true'");
    expect(continuation).toContain("publish-supabase-free-public-intelligence.mjs --verified-publication");
    expect(continuation).toContain("verifyPublishedIntelligenceReadback(receipt)");
  });
  it("has a bounded independent 4+8 B2 request envelope and never receives fund secrets",()=>{
    const budgets=[...continuation.matchAll(/^\s+B2_REQUEST_BUDGET: "(\d+)"/gmu)]
      .map(x=>Number(x[1]));
    expect(budgets).toEqual([12,4,8]);
    expect(budgets[1]+budgets[2]).toBe(budgets[0]);
    expect(continuation).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(continuation).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN:");
    expect(continuation).not.toContain("SUPABASE_DB_URL: \u0024{{ secrets.");
    expect(continuation).not.toContain("COINBASE_API_KEY: \u0024{{ secrets.");
    expect(continuation).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY");
    expect(cli).toContain("process.env.COINBASE_X402_MAINNET_ACK");
    expect(cli).toContain("approvedIndependentReviewerFromEnv()");
    expect(cli).toContain("writeFileSync(dest,bytes,{flag:\"wx\",mode:0o600})");
  });
});

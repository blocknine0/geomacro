import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

const flow=readFileSync(".github/workflows/single-original-machine-private-no-funds.yml","utf8");
const operator=readFileSync("scripts/ops/accept-private-single-original-authority.ts","utf8");
describe("private one-original B2 machine facts/rights operator",()=>{
  it("cannot run on cron, push, PR or without exact manually pinned private SHA",()=>{
    expect(flow).toContain("workflow_dispatch:");
    expect(flow).toContain("signed_b2_key:");
    expect(flow).toContain("signed_b2_sha256:");
    expect(flow).toContain("github.event_name == 'workflow_dispatch'");
    expect(flow).toContain("github.ref == 'refs/heads/main'");
    expect(flow).toContain("environment: production");
    expect(flow).not.toMatch(/^\s+(?:schedule|pull_request|push):/mu);
    expect(flow).toContain('"geomacro-evidence/v1/private/single-original-machine/"+pin+".json"');
    expect(flow).toContain("SIGNED_PRIVATE_INPUT_EXACT_READBACK_INVALID");
  });
  it("does not reset the per-run six-attempt budget per process",()=>{
    const budgets=[...flow.matchAll(/^\s+B2_REQUEST_BUDGET: "(\d+)"/gmu)]
      .map(m=>Number(m[1]));
    expect(budgets).toEqual([6,3,3]);
    expect(budgets.slice(1).reduce((sum,n)=>sum+n,0)).toBe(budgets[0]);
    expect(flow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(flow).toContain("D1_DATABASE_ID=$id");
  });
  it("requires 0700 root and 0600 exact content-addressed input with no user source logs",()=>{
    for(const s of [
      "GEOMACRO_PRIVATE_REVIEW_DIR",
      'basename(file)!==pin+".json"',
      "lstatSync(input).isSymbolicLink()",
      "(st.mode&0o077)!==0",
      'createHash("sha256").update(bytes).digest("hex")!==pin',
      'preparePrivateSingleOriginalFactualHandoff({',
      'Object.keys(inputJson).sort().join(",")!=="candidate,envelope"',
    ])expect(operator).toContain(s);
    expect(operator).not.toContain("publishB2VerifiedHotSnapshot");
    expect(operator).not.toContain("settleCoinbaseX402");
    expect(operator).not.toContain("signRiskObject");
    expect(operator).not.toContain("source_article_url");
    expect(operator).toContain("public_hot_published:false");
    expect(operator).toContain("derived_factual_input_sha256:qualified.derived_input_sha256");
    expect(operator).toContain("gri_current_certified:false");
    expect(operator).toContain("payments:0");
  });
  it("injects only public authority verification pins and B2/D1 quota credentials",()=>{
    expect(flow).toContain("GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:");
    expect(flow).toContain("GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:");
    expect(flow).toContain("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:");
    expect(flow).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:");
    expect(flow).not.toContain("COINBASE_API_KEY:");
    expect(flow).not.toContain("SUPABASE_DB_URL: \u0024{{ secrets.");
    expect(flow).not.toContain("COINBASE_X402_MAINNET_ACK: \u0024{{ secrets.");
  });
});

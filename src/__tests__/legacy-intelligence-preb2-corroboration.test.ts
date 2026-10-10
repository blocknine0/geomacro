import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs","utf8");
const workflow=readFileSync(".github/workflows/intelligence-scored-refresh.yml","utf8");
const control=readFileSync("scripts/ops/publish-b2-verified-hot-snapshot.mjs","utf8");
describe("#1827 legacy publishing may not spend B2 for uncorroborated GDELT current news",()=>{
  it("rejects single-source current GDELT observations before ANY B2 GET, PUT or hot overlay",()=>{
    const guarded=source.indexOf('if (rows.some(row => row.public_status !== "verified_b2"))');
    const rejected=source.indexOf("LEGACY_INTELLIGENCE_UNCORROBORATED_B2_PUBLISH_BLOCKED");
    const newB2=source.indexOf("const b2 = createB2Client(",guarded);
    const firstGet=source.indexOf("await b2.get(PROOF_KEY)",guarded);
    const firstPut=source.indexOf("await b2.put(LIVE_KEY, packed)",guarded);
    const overlay=source.indexOf("await publishHotOverlay(current, generatedAt, digest)",guarded);
    const d1=source.indexOf("await publishB2VerifiedHotSnapshot({",guarded);
    expect(guarded).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(guarded);
    for(const position of [newB2,firstGet,firstPut,overlay,d1])
      expect(position).toBeGreaterThan(rejected);
    expect(source).not.toContain("SUPABASE_BACKFILL_ALLOWED");
  });
  it("preserves legacy Supabase freeze, manual gate and shared D1-B2 budget",()=>{
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: intelligence_scored_legacy_recovery");
    expect(workflow).not.toContain("cron:");
    expect(control).toContain('if(product==="intelligence")');
    expect(control).toContain("qualifyIndependentSameEvent({");
  });
});
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const wf=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
const section=(start,end)=>{
 const i=wf.indexOf("  "+start+":");
 const j=wf.indexOf("  "+end+":",i+1);
 assert(i>=0&&j>i);
 return wf.slice(i,j);
};
test("both actual Website D1 admission calls receive independent Billing Read",()=>{
 const diagnostic=section("phase2f-readonly-quota-diagnostic","quota-admission");
 const admission=section("quota-admission","archive-only-when-d1-held");
 const exact="CLOUDFLARE_BILLING_READ_TOKEN: ${{ secrets.CLOUDFLARE_BILLING_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}";
 for(const s of [diagnostic,admission]){
  assert(s.includes(exact));
  assert(s.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"));
  assert(s.includes("run: node scripts/ops/plan-d1-bundled-work.mjs"));
  assert(s.includes("environment: production"));
 }
 assert.match(diagnostic,/github\.event_name == 'push'/u);
 assert.match(admission,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(admission,/github\.event_name != 'pull_request'/u);
 assert(admission.includes("ref: ${{ github.sha }}"));
 assert(!admission.includes("ref: main\n"));
});
test("permission wiring is not a Paid entitlement bypass, a money activation or a HOLD removal",()=>{
 const a=section("quota-admission","archive-only-when-d1-held");
 assert(!a.includes("continue-on-error: true"));
 assert(!a.includes("wrangler deploy"));
 assert(!a.includes("rm config/d1-hotspot-v2-canary.hold"));
 const script=readFileSync("scripts/ops/plan-d1-bundled-work.mjs","utf8");
 assert.match(script,/readCloudflareWorkersPaidProof/u);
 assert.match(script,/paidProof\.verified===true/u);
 assert.match(script,/readFiveUsdSpendGuard/u);
 assert.match(script,/GEOMACRO_OWNER_D1_NORMAL_DAILY_BUDGET_HELD/u);
});

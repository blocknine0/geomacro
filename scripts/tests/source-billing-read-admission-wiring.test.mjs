import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const expected='CLOUDFLARE_BILLING_READ_TOKEN: ${{ secrets.CLOUDFLARE_BILLING_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}';
test("registered source and six-hour B2 archive quota jobs receive existing Billing Read proof",()=>{
 for(const [path,anchor] of [
  [".github/workflows/all-source-reusable-news-json.yml","id: quota"],
  [".github/workflows/phase2h-private-raw-archive.yml","name: Verify provider-approved D1 maintenance=true admission"],
 ]){
  const y=readFileSync(path,"utf8");
  const start=y.indexOf(anchor);
  assert(start>=0,path);
  const run=y.indexOf("run: ",start);
  assert(run>start&&run-start<800,path);
  const env=y.slice(start,run);
  assert(env.includes(expected),path);
  assert(env.includes("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"),path);
  assert(env.includes("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"),path);
  assert.match(y,/plan-d1-bundled-work\.mjs/u);
  assert.match(y,/environment: production/u);
  assert(!env.includes("GEOMACRO_PAID=true"));
 }
});
test("billing permission does not bypass owner pacing or commerce holds",()=>{
 const p=readFileSync("scripts/ops/plan-d1-bundled-work.mjs","utf8");
 assert.match(p,/readCloudflareWorkersPaidProof/u);
 assert.match(p,/readFiveUsdSpendGuard/u);
 assert.match(p,/evaluateOwnerD1DailyEnvelope/u);
 assert.match(p,/ownerNormalHold/u);
 assert.match(p,/GEOMACRO_OWNER_D1_NORMAL_DAILY_BUDGET_HELD/u);
 for(const path of [
  ".github/workflows/all-source-reusable-news-json.yml",
  ".github/workflows/phase2h-private-raw-archive.yml"
 ]){
  const y=readFileSync(path,"utf8");
  assert.doesNotMatch(y,/rm config\/d1-hotspot-v2-canary\.hold/u);
  assert.doesNotMatch(y,/GEOMACRO_PHASE2H_REF_ONLY_V1: "1"/u);
 }
});

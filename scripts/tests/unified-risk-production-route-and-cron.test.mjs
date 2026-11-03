import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const config=JSON.parse(readFileSync(new URL("../../workers/control-plane/wrangler.example.jsonc",import.meta.url),"utf8"));
const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");

test("one-minute canonical production cron and single api.geomacro.live custom domain",()=>{
  assert.deepEqual(config.triggers.crons,["* * * * *"]);
  assert.deepEqual(config.routes,[{pattern:"api.geomacro.live",custom_domain:true,zone_name:"geomacro.live"}]);
  assert.equal(config.name,"geomacro-control-plane");
  assert.equal(config.workers_dev,true);
});

test("unified generation, D1-to-Supabase sync and seven-day cleanup fail visibly to cron",()=>{
  for(const call of ["scheduledUnifiedRisk(env,utc.getTime())",
    "syncUnifiedRiskSupabase(env,{now:utc.getTime()})",
    "cleanupUnifiedRiskSupabase(env,{now:utc.getTime()})"]){
    const start=source.indexOf("ctx.waitUntil("+call);
    assert.ok(start>=0,"missing scheduled task "+call);
    const section=source.slice(start,start+250);
    assert.match(section,/then\(r=>\{if\(!r\.ok\)throw Error\(/);
    assert.doesNotMatch(section,/\.catch\(/);
  }
});

test("owner-only production canary performs exact HMAC Supabase readback, not oldest backlog",()=>{
  assert.match(source,/syncUnifiedRiskSupabase\(env,\{scope:"CANARY_EXACT"\}\)/);
  assert.match(source,/v1\/internal\/risk-gate\/unified-acceptance/);
});

test("owner-only 18-page SHA repair route is behind existing admin auth and covered by daily strict census",()=>{
 const authAt=source.indexOf("const auth = authorized(request, env)");
 const repairAt=source.indexOf('url.pathname==="/v1/internal/risk-gate/unified-reconcile-page"');
 assert.ok(authAt>=0&&repairAt>authAt,"reconciliation must use owner admin guard");
 assert.match(source,/scope:"CANONICAL_PAGE",page:body.page/);
 assert.match(workflow,/node scripts\/ops\/reconcile-unified-risk-207-production\.mjs/);
 const daily=readFileSync(new URL("../../.github/workflows/unified-risk-daily-production-census.yml",import.meta.url),"utf8");
 assert.match(daily,/cron: "30 18 \* \* \*"/);
 assert.match(daily,/node scripts\/ops\/reconcile-unified-risk-207-production\.mjs/);
 assert.match(daily,/remote_hash_matches == 207/);
});

test("production deployment requires TLS authenticated domain census and anonymous evaluation refusal",()=>{
  assert.match(workflow,/https:\/\/api\.geomacro\.live\/v1\/internal\/risk-gate\/unified-census/);
  assert.match(workflow,/API_CUSTOM_DOMAIN_DNS_TLS_AUTH_OR_CENSUS_UNVERIFIED/);
  assert.match(workflow,/API_CUSTOM_DOMAIN_UNAUTHORIZED_EVALUATION_NOT_DENIED/);
  assert.match(workflow,/cache-control:/);
});

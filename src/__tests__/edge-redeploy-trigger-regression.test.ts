import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

describe("config-only and shared freshness changes redeploy all three production signed edges",()=>{
 const cases=[
  ["intelligence","configure-intelligence-edge-d1-quota.mjs"],
  ["global-risk","configure-global-risk-edge-d1-quota.mjs"],
  ["risk-indices","configure-risk-indices-edge-d1-quota.mjs"],
 ] as const;
 for(const [name,config] of cases)it(name+" deploys on changed Wrangler cache strategy and shared source clock",()=>{
  const workflow=readFileSync(".github/workflows/deploy-"+name+"-edge.yml","utf8");
  const wrangler=JSON.parse(readFileSync("workers/"+name+"-edge/wrangler.jsonc","utf8"));
  expect(workflow).toContain('branches: [main]').or.toContain('      - main');
  expect(workflow).toContain('"workers/shared/current-source-clock.mjs"');
  expect(workflow).toContain('"workers/shared/b2-origin-negative-cache.mjs"');
  expect(workflow).toContain('"scripts/ops/'+config+'"');
  if(name!=="intelligence")expect(workflow).toContain('"workers/'+name+'-edge/wrangler.jsonc"');
  else expect(workflow).toContain('"workers/intelligence-edge/**"');
  expect(workflow).toContain("Deploy read-only");
  expect(workflow).toContain("native");
  expect(wrangler.cache).toMatchObject({enabled:true,cross_version_cache:false});
 });
});

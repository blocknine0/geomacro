import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {makeQuotaProtectedIntelligenceConfig} from "../../scripts/ops/configure-intelligence-edge-d1-quota.mjs";
import {makeQuotaProtectedGlobalRiskConfig} from "../../scripts/ops/configure-global-risk-edge-d1-quota.mjs";
import {makeQuotaProtectedRiskIndicesConfig} from "../../scripts/ops/configure-risk-indices-edge-d1-quota.mjs";

const UUID="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const productCases=[
 ["intelligence",makeQuotaProtectedIntelligenceConfig],
 ["global-risk",makeQuotaProtectedGlobalRiskConfig],
 ["risk-indices",makeQuotaProtectedRiskIndicesConfig],
] as const;

describe("signed hot current Workers never reuse across-version positive caches",()=>{
 for(const [product,makeConfig] of productCases){
   it(product+" forbids previously signed historical cache from earlier Workers",()=>{
     const path="workers/"+product+"-edge";
     const conf=JSON.parse(readFileSync(path+"/wrangler.jsonc","utf8"));
     expect(conf.main).toBe("src/index.mjs");
     expect(conf.workers_dev).toBe(true);
     expect(conf.cache.enabled).toBe(true);
     expect(conf.cache.cross_version_cache).toBe(false);
     expect(conf.services).toContainEqual({binding:"CONTROL_PLANE",service:"geomacro-control-plane"});
     const prepared=makeConfig(conf,UUID);
     expect(prepared.cache.cross_version_cache).toBe(false);
     expect(prepared.d1_databases).toHaveLength(1);
     expect(prepared.d1_databases[0].database_name).toBe("geomacro-control-plane");
     const old={...conf,cache:{enabled:true,cross_version_cache:true}};
     expect(()=>makeConfig(old,UUID)).toThrow();
   });
   it(product+" keeps the unchanged original-source fail-closed data boundary",()=>{
     const code=readFileSync("workers/"+product+"-edge/src/index.mjs","utf8");
     expect(code).toContain('validatedCachedLiveResponse');
     expect(code).toContain("originalSourceIsCurrent");
     expect(code).toContain('liveEdgeCacheControl');
     expect(code).toContain('"x-geomacro-native-clock-contract": "live-60m-v1"');
     expect(code).not.toContain("stale-if-error=86400");
   });
 }
});

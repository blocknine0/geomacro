import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {readOnlyCandidate} from "../../workers/web-candidate/read-only.mjs";
import {prepareWebCandidate} from "./prepare-web-candidate.mjs";

test("candidate denies writes/payment/authorization before invoking the app",async()=>{
 let calls=0;
 const guard=readOnlyCandidate({fetch(){calls++;return new Response("unexpected")}});
 for(const method of ["POST","PUT","PATCH","DELETE","OPTIONS"])
  assert.equal((await guard.fetch(new Request("https://candidate.invalid/api/v1/intelligence/query",{method}))).status,405);
 for(const name of ["Authorization","PAYMENT-SIGNATURE","X-PAYMENT","X-Payment-Signature","Payment-Response"])
  assert.equal((await guard.fetch(new Request("https://candidate.invalid/api/health",{headers:{[name]:"synthetic"}}))).status,405);
 assert.equal(calls,0);
});
test("candidate preserves real healthy and unhealthy status/body; never greens deep health",async()=>{
 for(const status of [200,503]){
  const body=JSON.stringify({ok:status===200});
  const guard=readOnlyCandidate({fetch:async()=>new Response(body,{status,headers:{"content-type":"application/json"}})});
  const result=await guard.fetch(new Request("https://candidate.invalid/api/health?deep=1"));
  assert.equal(result.status,status);assert.equal(await result.text(),body);
  assert.equal(result.headers.get("X-Geomacro-Candidate-Mode"),"read-only-no-funds");
  assert.equal(result.headers.get("X-Robots-Tag"),"noindex, nofollow");
 }
});
test("candidate HEAD has no body and preserves failure status",async()=>{
 const guard=readOnlyCandidate({fetch:async()=>new Response("unavailable",{status:503})});
 const result=await guard.fetch(new Request("https://candidate.invalid/api/health",{method:"HEAD"}));
 assert.equal(result.status,503);assert.equal(await result.text(),"");
});
test("build preparation discards inherited production routes and bindings and pins exact SHA",()=>{
 const root=mkdtempSync(resolve(tmpdir(),"geomacro-web-candidate-"));
 try{
  for(const dir of [".output/server",".output/public/.well-known","workers/web-candidate"])
   mkdirSync(resolve(root,dir),{recursive:true});
  copyFileSync("workers/web-candidate/read-only.mjs",resolve(root,"workers/web-candidate/read-only.mjs"));
  const config={main:"index.mjs",assets:{directory:"../public",binding:"ASSETS"},no_bundle:true,
   compatibility_date:"2026-10-18",compatibility_flags:["nodejs_compat","global_fetch_strictly_public"],
   routes:["geomacro.live/*"],vars:{SECRET:"synthetic"},d1_databases:[{}]};
  const path=resolve(root,".output/server/wrangler.json");
  writeFileSync(path,JSON.stringify(config));
  assert.throws(()=>prepareWebCandidate({root,sha:"main"}),/EXACT_SHA/);
  prepareWebCandidate({root,sha:"a".repeat(40)});
  const out=JSON.parse(readFileSync(resolve(root,".output/server/candidate-wrangler.json"),"utf8"));
  assert.equal(out.name,"geomacro-web-candidate");assert.equal(out.routes,undefined);
  assert.equal(out.d1_databases,undefined);assert.deepEqual(out.vars,{GEOMACRO_SUPABASE_RUNTIME_MODE:"standby"});
  assert.equal(out.limits.cpu_ms,10);assert.equal(out.assets.run_worker_first,true);
  const marker=JSON.parse(readFileSync(resolve(root,".output/public/.well-known/geomacro-build.json"),"utf8"));
  assert.equal(marker.canonical_main_sha,"a".repeat(40));assert.equal(marker.production_activation_performed,false);
  writeFileSync(path,JSON.stringify({...config,main:"unknown.mjs"}));
  assert.throws(()=>prepareWebCandidate({root,sha:"a".repeat(40)}),/LAYOUT_UNVERIFIED/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

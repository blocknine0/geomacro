import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {readOnlyCandidate} from "../../workers/web-candidate/read-only.mjs";
import {prepareWebCandidate} from "./prepare-web-candidate.mjs";
import {materializeCandidateAssets} from "./materialize-web-candidate-assets.mjs";
import {createHash} from "node:crypto";
import {waitForCandidateMarker} from './web-candidate-propagation.mjs';

test("independent deployed candidate verifies canonical free machine GET without enabling x402",()=>{
 const source=readFileSync("scripts/ops/verify-web-candidate.mjs","utf8");
 assert.ok(source.includes('const machine=await get("/api/v1/intelligence/query")'));
 assert.ok(source.includes('machine.json.payment_rail_status!=="CONTROLLED_PRELAUNCH_UNAVAILABLE"'));
 assert.ok(source.includes('machine.json.discovery_is_free!==true'));
 assert.ok(source.includes('machine.json.execution_authorized!==false'));
 assert.ok(source.includes('machine.res.headers.has("PAYMENT-REQUIRED")'));
 assert.ok(source.includes('machine_payment_rail_locked:true'));
 const server=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
 assert.ok(server.includes('payment_rail_status: config === null'));
 assert.ok(server.includes('machine_next_steps: {'));
});
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
test("post-build marker uses the public asset binding behind the same request fence",async()=>{
 let appCalls=0,assetCalls=0;
 const guard=readOnlyCandidate({fetch:async()=>{appCalls++;return new Response("not found",{status:404})}});
 const env={ASSETS:{fetch:async()=>{assetCalls++;return Response.json({canonical_main_sha:"a".repeat(40)})}}};
 const url="https://candidate.invalid/.well-known/geomacro-build.json";
 const marker=await guard.fetch(new Request(url),env);
 assert.equal(marker.status,200);assert.equal((await marker.json()).canonical_main_sha,"a".repeat(40));
 assert.equal(marker.headers.get("X-Geomacro-Candidate-Mode"),"read-only-no-funds");
 assert.equal((await guard.fetch(new Request(url,{method:"POST"}),env)).status,405);
 assert.equal((await guard.fetch(new Request(url,{headers:{authorization:"synthetic"}}),env)).status,405);
 assert.equal(appCalls,0);assert.equal(assetCalls,1);
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
  assert.equal(out.name,"geomacro-web-candidate-isolated");assert.equal(out.routes,undefined);
  assert.equal(out.d1_databases,undefined);assert.deepEqual(out.vars,{GEOMACRO_SUPABASE_RUNTIME_MODE:"standby"});
  assert.equal(out.limits,undefined);assert.equal(out.usage_model,undefined);
  assert.equal(out.assets.run_worker_first,true);
  const marker=JSON.parse(readFileSync(resolve(root,".output/public/.well-known/geomacro-build.json"),"utf8"));
  assert.equal(marker.canonical_main_sha,"a".repeat(40));assert.equal(marker.production_activation_performed,false);
  writeFileSync(path,JSON.stringify({...config,main:"unknown.mjs"}));
  assert.throws(()=>prepareWebCandidate({root,sha:"a".repeat(40)}),/LAYOUT_UNVERIFIED/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test("Lovable public image paths use shipped assets behind the same no-write fence",async()=>{
 let appCalls=0,assetCalls=0;
 const guard=readOnlyCandidate({fetch:async()=>{appCalls++;return new Response('wrong app')}});
 const env={ASSETS:{fetch:async()=>{assetCalls++;return new Response('image',{headers:{'content-type':'image/png'}})}}};
 const url='https://candidate.invalid/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png';
 assert.equal(await (await guard.fetch(new Request(url),env)).text(),'image');
 assert.equal((await guard.fetch(new Request(url,{headers:{authorization:'synthetic'}}),env)).status,405);
 assert.equal(appCalls,0);assert.equal(assetCalls,1);
});
test("candidate images require exact pinned PNG bytes; no partial files on corruption",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'geomacro-candidate-images-'));
 const bytes=Buffer.from('89504e470d0a1a0a01020304','hex');
 const pins=['logo.png','background.png'].map(file=>({file,sha256:createHash('sha256').update(bytes).digest('hex')}));
 try{
  mkdirSync(resolve(root,'src/assets'),{recursive:true});
  for(const pin of pins)writeFileSync(resolve(root,'src/assets',pin.file+'.asset.json'),JSON.stringify({asset_id:'9118c3e7-7750-4173-90cc-dd0445585e92',url:'/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/'+pin.file,size:bytes.length,content_type:'image/png'}));
  let calls=0;
  const fetchImpl=async(url,init)=>{calls++;assert.equal(new URL(url).origin,'https://geomacro.live');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.deepEqual(init.headers,{Accept:'image/png'});return new Response(calls===2?Buffer.alloc(bytes.length):bytes,{headers:{'content-type':'image/png'}})};
  await assert.rejects(materializeCandidateAssets({root,pins,fetchImpl}),/BYTES_MISMATCH/);
  assert.throws(()=>readFileSync(resolve(root,'.output/public/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/logo.png')),/ENOENT/);
  const receipt=await materializeCandidateAssets({root,pins,fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'image/png'}})});
  assert.equal(receipt.verified_images,2);assert.equal(receipt.runtime_asset_proxy,false);
  assert.deepEqual(readFileSync(resolve(root,'.output/public/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/logo.png')),bytes);
  for(const response of [new Response('<html>',{headers:{'content-type':'text/html'}}),new Response(Buffer.alloc(bytes.length+1),{headers:{'content-type':'image/png'}})])
   await assert.rejects(materializeCandidateAssets({root,pins,fetchImpl:async()=>response}),/ASSET_(READ_FAILED|SIZE_MISMATCH)/);
 }finally{rmSync(root,{recursive:true,force:true})}
});

test('edge propagation admits only the exact requested revision after a bounded wait',async()=>{
 const marker=sha=>({res:{status:200},json:{schema_version:'geomacro.deployment-build.v1',canonical_main_sha:sha,production_activation_performed:false,candidate_mode:'read-only-no-funds'}});
 let calls=0,pauses=0;
 const result=await waitForCandidateMarker(async()=>marker(++calls===1?'a'.repeat(40):'b'.repeat(40)),'b'.repeat(40),{pause:async()=>{pauses++}});
 assert.equal(result.json.canonical_main_sha,'b'.repeat(40));assert.equal(calls,2);assert.equal(pauses,1);
 calls=0;pauses=0;
 await assert.rejects(waitForCandidateMarker(async()=>{calls++;return marker('a'.repeat(40))},'b'.repeat(40),{pause:async()=>{pauses++}}),/EXACT_SHA_MISMATCH/);
 assert.equal(calls,7);assert.equal(pauses,6);
});
test('propagation wait never retries malformed, activated, unsafe or failed markers',async()=>{
 const valid={res:{status:200},json:{schema_version:'geomacro.deployment-build.v1',canonical_main_sha:'a'.repeat(40),production_activation_performed:false,candidate_mode:'read-only-no-funds'}};
 for(const marker of [null,{...valid,res:{status:503}},{...valid,json:{...valid.json,production_activation_performed:true}},{...valid,json:{...valid.json,candidate_mode:'production'}},{...valid,json:{...valid.json,canonical_main_sha:'unknown'}}]){
  let calls=0;
  await assert.rejects(waitForCandidateMarker(async()=>{calls++;return marker},'b'.repeat(40),{pause:async()=>{throw Error('must not pause')}}),/UNSAFE_OR_INVALID/);assert.equal(calls,1);
 }
 await assert.rejects(waitForCandidateMarker(async()=>{throw Error('transport failed')},'b'.repeat(40)),/transport failed/);
});

test("isolated identity preserves the strict remote binding allowlist without migrating old secrets",()=>{
 const workflow=readFileSync(".github/workflows/deploy-web-candidate.yml","utf8");
 const prep=readFileSync("scripts/ops/prepare-web-candidate.mjs","utf8");
 const check=readFileSync("scripts/ops/verify-web-candidate.mjs","utf8");
 assert.ok(workflow.includes("w.id==='geomacro-web-candidate-isolated'"));
 assert.ok(workflow.includes("api+'/geomacro-web-candidate-isolated/settings'"));
 assert.ok(workflow.includes("CANDIDATE_PRIVATE_OR_UNKNOWN_BINDING_PRESENT"));
 assert.ok(workflow.includes("b.type==='assets'&&b.name==='ASSETS'"));
 assert.ok(workflow.includes("b.type==='plain_text'&&b.name==='GEOMACRO_SUPABASE_RUNTIME_MODE'&&b.text==='standby'"));
 assert.ok(workflow.includes("b.type==='secret_text'&&b.name==='GEOMACRO_SECURITY_FINGERPRINT_PEPPER'"));
 assert.ok(workflow.includes("npx -y wrangler@4.136.3 deploy --config .output/server/candidate-wrangler.json --keep-vars"));
 assert.ok(prep.includes('name:"geomacro-web-candidate-isolated"'));
 assert.match(check,/^const base="https:\/\/geomacro-web-candidate-isolated\.daspallab202391\.workers\.dev";$/mu);
 assert.ok(!workflow.includes("wrangler delete"));
 assert.ok(!workflow.includes("workers/scripts/geomacro-web-candidate-isolated/bindings"));
});

test("new isolated edge may transiently return 404 but only real fenced marker passes",async()=>{
 let calls=0,pauses=0;
 const good={res:{status:200},json:{
   schema_version:"geomacro.deployment-build.v1",
   canonical_main_sha:"b".repeat(40),
   candidate_mode:"read-only-no-funds",
   production_activation_performed:false}};
 const receipt=await waitForCandidateMarker(async()=>{
   calls++;return calls<=2?{res:{status:404},json:null}:good;
 },"b".repeat(40),{pause:async()=>{pauses++},allowInitial404:true});
 assert.equal(receipt,good);assert.equal(calls,3);assert.equal(pauses,2);
 await assert.rejects(waitForCandidateMarker(async()=>({res:{status:404},json:null}),
  "b".repeat(40),{pause:async()=>{},allowInitial404:true}),
  /FIRST_EDGE_ROUTE_UNAVAILABLE/);
 for(const marker of [
   {res:{status:200},json:null},
   {res:{status:503},json:null},
   {res:{status:404},json:good.json},
 ])await assert.rejects(waitForCandidateMarker(async()=>marker,
  "b".repeat(40),{pause:async()=>{throw Error("should not retry")},allowInitial404:true}),
  /UNSAFE_OR_INVALID/);
});
test("only exact marker path can bypass initial unpropagated route response",()=>{
 const source=readFileSync("scripts/ops/verify-web-candidate.mjs","utf8");
 assert.ok(source.includes('if(path==="/.well-known/geomacro-build.json"&&res.status===404)'));
 assert.ok(source.includes('throw Error("CANDIDATE_READ_ONLY_FENCE_NOT_VERIFIED")'));
 assert.ok(source.includes('{allowInitial404:true}'));
});

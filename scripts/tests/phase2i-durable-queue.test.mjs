import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {appendAndLeasePhase2i,acknowledgePhase2i,phase2iDurableStatus,
 chunkPhase2iCandidates,durableCandidateId} from "../lib/phase2i-durable-queue-client.mjs";
import {Phase2iDurableQueueDO} from "../../workers/phase2i-durable-queue/worker.mjs";
const ROOT="test-root-for-only-offline-durable-source-queue";
const ENV={GEOMACRO_PHASE2I_DURABLE_URL:"https://phase2i.test.workers.dev/",
 GEOMACRO_PHASE2I_DURABLE_TOKEN:"test-only-durable-lease-authentication-token"};
const date=new Date(Date.now()-30*60_000).toISOString();
const candidate=n=>({category:["geopolitics","macro","rare_earth"][n%3],
 articleUrl:"https://publisher.example.org/story/"+n,publishedAt:date,
 title:"Original item "+n,sourceId:"publisher.example.org",
 sourceUrl:"https://publisher.example.org/rss",credit:null,
 issuerContextCountryIso3:null});
class Storage {
 constructor(){this.data=new Map()}
 async get(k){if(Array.isArray(k))return new Map(k.filter(x=>this.data.has(x)).map(x=>[x,structuredClone(this.data.get(x))]));return this.data.has(k)?structuredClone(this.data.get(k)):undefined}
 async put(k,v){if(typeof k==="string")this.data.set(k,structuredClone(v));else for(const [key,value] of Object.entries(k))this.data.set(key,structuredClone(value))}
 async list({prefix,limit=1000,startAfter=""}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)&&key>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,v])=>[key,structuredClone(v)]))}
 async transaction(fn){return fn(this)}
}
class R2 {
 constructor(){this.objects=new Map();this.corrupt=false}
 async put(key,bytes){this.objects.set(key,new Uint8Array(bytes));return {etag:"immutable"}}
 async get(key){if(!this.objects.has(key))return null;const result=new Uint8Array(this.objects.get(key));if(this.corrupt)result[0]^=255;return {arrayBuffer:async()=>result.buffer}}
}
const setup=()=>{
 const storage=new Storage(),r2=new R2();
 const stub=new Phase2iDurableQueueDO({storage,blockConcurrencyWhile:fn=>fn()},{PHASE2I_R2:r2});
 const fetchImpl=(url,opts)=>stub.fetch(new Request(url,opts));
 return {storage,r2,fetchImpl};
};
test("7,969+ real-shaped candidates -> 16 encrypted R2 chunks, no ephemeral 8k hard-cap",async()=>{
 const rows=Array.from({length:7969},(_,i)=>candidate(i));
 assert.equal(chunkPhase2iCandidates(rows).length,16);
 assert.ok(chunkPhase2iCandidates(rows).every(c=>c.length<=500));
 const fixture=setup();
 const before=process.memoryUsage().heapUsed;
 const ingest=await appendAndLeasePhase2i({observed:rows,root:ROOT,env:ENV,fetchImpl:fixture.fetchImpl});
 assert.equal(ingest.appended_new,7969);
 assert.equal(ingest.verified_encrypted_objects,16);
 assert.equal(fixture.r2.objects.size,16);
 assert.ok(ingest.candidates.length<=500);
 const status=await phase2iDurableStatus({env:ENV,fetchImpl:fixture.fetchImpl});
 assert.equal(status.pending_eligible,7969);
 for(const bytes of fixture.r2.objects.values()){
  const encoded=Buffer.from(bytes).toString("utf8");
  assert.equal(encoded.includes("Original item"),false);
  assert.equal(encoded.includes("publisher.example.org/story"),false);
 }
 assert.ok(process.memoryUsage().heapUsed-before<60*1024*1024,
  "incremental offline heap under 60MiB; production Worker RSS not proven");
 const retry=await appendAndLeasePhase2i({observed:rows,root:ROOT,env:ENV,fetchImpl:fixture.fetchImpl});
 assert.equal(retry.appended_new,0);
 assert.equal(retry.duplicate_existing,7969);
});
test("expired lease recovers after crash and only D1 readback record hashes count",async()=>{
 const f=setup(),rows=Array.from({length:11},(_,i)=>candidate(i+9000));
 const first=await appendAndLeasePhase2i({observed:rows,root:ROOT,env:ENV,fetchImpl:f.fetchImpl});
 const blocked=await appendAndLeasePhase2i({observed:[],root:ROOT,env:ENV,fetchImpl:f.fetchImpl});
 assert.equal(blocked.lease,null);
 const state=await f.storage.get("chunk:"+first.lease.chunk_id);
 state.leaseUntil=Date.now()-1;
 await f.storage.put("chunk:"+first.lease.chunk_id,state);
 const retry=await appendAndLeasePhase2i({observed:[],root:ROOT,env:ENV,fetchImpl:f.fetchImpl});
 assert.equal(retry.candidates.length,11);
 await assert.rejects(()=>acknowledgePhase2i({lease:first.lease,
  verifiedRecordIds:rows.slice(0,5).map(durableCandidateId),env:ENV,fetchImpl:f.fetchImpl}),/409/);
 await acknowledgePhase2i({lease:retry.lease,
  verifiedRecordIds:rows.slice(0,5).map(durableCandidateId),env:ENV,fetchImpl:f.fetchImpl});
 const second=await appendAndLeasePhase2i({observed:[],root:ROOT,env:ENV,fetchImpl:f.fetchImpl});
 await acknowledgePhase2i({lease:second.lease,
  verifiedRecordIds:rows.slice(5,10).map(durableCandidateId),env:ENV,fetchImpl:f.fetchImpl});
 const third=await appendAndLeasePhase2i({observed:[],root:ROOT,env:ENV,fetchImpl:f.fetchImpl});
 await acknowledgePhase2i({lease:third.lease,
  verifiedRecordIds:[durableCandidateId(rows[10])],env:ENV,fetchImpl:f.fetchImpl});
 const status=await phase2iDurableStatus({env:ENV,fetchImpl:f.fetchImpl});
 assert.equal(status.acknowledged,11);
 assert.equal(status.pending_eligible,0);
 assert.equal(status.fully_d1_drained,true);
});
test("encrypted backlog restore is restricted to protected main source-only events",()=>{
 const preload=readFileSync("scripts/ops/preload-phase2i-encrypted-backlog.mjs","utf8");
 assert.match(preload,/env\.GITHUB_REPOSITORY!==\"blocknine0\\/geomacro\"/);
 assert.match(preload,/env\.GITHUB_REF!==\"refs\\/heads\\/main\"/);
 assert.match(preload,/env\.GEOMACRO_SOURCE_INTAKE_ONLY!==\"1\"/);
 assert.match(preload,/env\.PHASE2I_PROVIDER_SOURCE_INTAKE!==\"true\"/);
 assert.match(preload,/\[\"schedule\",\"workflow_run\",\"workflow_dispatch\"\]/);
 assert.match(preload,/PHASE2I_BACKLOG_AUTH_UNAVAILABLE/);
});
test("R2 GET SHA mismatch prevents Durable Object state cursor advance",async()=>{
 const f=setup();f.r2.corrupt=true;
 await assert.rejects(()=>appendAndLeasePhase2i({observed:[candidate(9999)],
  root:ROOT,env:ENV,fetchImpl:f.fetchImpl}),/503/);
 assert.equal(f.storage.data.size,0);
});
test("workflows preserve D1 quota mutual exclusion and durable opt-in",()=>{
 const source=readFileSync("scripts/ops/phase2i-source-only-raw-tick.ts","utf8");
 for(const p of [".github/workflows/private-global-osint-15m.yml",
  ".github/workflows/hot50-direct-original-news-20m.yml"]){
  const w=readFileSync(p,"utf8");
  assert.match(w,/GEOMACRO_PHASE2I_DURABLE_URL/);
  assert.match(w,/GEOMACRO_PHASE2I_DURABLE_TOKEN/);
  assert.match(w,/geomacro-permanent-news-publication/);
 }
 assert.match(source,/appendAndLeasePhase2i/);
 assert.match(source,/acknowledgePhase2i/);
 assert.match(source,/legacyPending/);
 assert.match(source,/d1_readback_verified!==true/);
});

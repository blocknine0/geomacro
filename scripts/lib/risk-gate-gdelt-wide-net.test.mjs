import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {GDELT_RISK_EVENT_SCHEMA,summarizeGdeltRiskEvents,
 validGdeltPrivateItem} from "../../lib/risk-gate-gdelt-event-wide-net.mjs";
import {putPrivateRiskGateGdelt,readPrivateRiskGateGdelt}
 from "../../workers/control-plane/src/risk-gate-gdelt-event-index.mjs";
import {publishGdeltRiskEventWideNet}
 from "../ops/publish-risk-gate-gdelt-wide-net.mjs";
const NOW=new Date("2026-11-02T15:06:00.000Z");
const BATCH="2026-11-02T15:00:00.000Z";
const sha=x=>createHash("sha256").update(x).digest("hex");
const line=({id,root="18",code=root+"1",place="Strait of Hormuz",source="https://example-news.org/report",date="20261102150000"}={})=>{
 const a=Array(61).fill("");
 a[0]=id??"98412";a[1]="20261102";a[26]=code;a[27]=root;a[28]=root;
 a[52]=place;a[53]="IR";a[59]=date;a[60]=source;
 return a.join("\t");
};
const text=()=>[
 line({id:"1",root:"18",code:"181"}),
 line({id:"2",root:"17",code:"171",place:"Suez Canal"}),
 line({id:"3",root:"05",code:"051",place:"Taiwan Strait"}),
 line({id:"4",root:"19",code:"191",place:"Capital",source:"https://example-news.org/macro"}),
 line({id:"2",root:"17",code:"171",place:"Suez Canal"})
].join("\n");
function packet(){
 const decoded=text(),source=summarizeGdeltRiskEvents(decoded,BATCH,NOW.getTime());
 const archive_sha256=sha("ZIP"),items=source.candidates.map(c=>{
  const source_url_sha256=sha(c.source_url);
  return {id:sha(["gdelt_v2_15m",c.gdelt_event_id,c.gdelt_batch_at,
   source_url_sha256].join("\x1f")),gdelt_event_id:c.gdelt_event_id,
   cameo_code:c.cameo_code,cameo_root:c.cameo_root,
   gdelt_index_at:c.gdelt_index_at,gdelt_batch_at:c.gdelt_batch_at,
   action_geo_fips:c.action_geo_fips,corridor_hints:c.corridor_hints,
   source_url_sha256,archive_sha256,
   source_evidence_verified:false,event_verified:false,
   commercial_rights_verified:false,signed_gro_generated:false,chargeable:false};
 });
 return {schema:GDELT_RISK_EVENT_SCHEMA,checked_at:NOW.toISOString(),
  batch_at:BATCH,items,archive_sha256,provider:"gdelt_v2_15m",
  source_event_verification:"INDEX_ONLY",commercial_rights_verified:false,
  customer_debit_enabled:false,predge_writes:0};
}
class DB{
 constructor(){this.rows=new Map()}
 prepare(query){return {bind:(...params)=>({
  query,params,
  all:async()=>{
   const data=[...this.rows.values()];
   if(query.includes("event_ref_id IN"))
    return {results:data.filter(r=>params.includes(r.event_ref_id))};
   return {results:data.slice(0,params[1])};
  },
  run:async()=>{
   if(query.startsWith("DELETE"))for(const [k,r] of this.rows)
     if(r.gdelt_index_at<params[0])this.rows.delete(k);
   return {success:true};
  }
 })}}
 async batch(items){
  for(const v of items){
   const p=v.params;
   this.rows.set(p[0],{
    event_ref_id:p[0],gdelt_event_id:p[1],cameo_code:p[2],
    cameo_root:p[3],gdelt_index_at:p[4],batch_at:p[5],
    action_geo_fips:p[6],corridor_hints_json:p[7],
    source_url_sha256:p[8],archive_sha256:p[9]
   });
  }
 }
}
test("five-corridor GDELT CAMEO shortlist is deterministic, bounded, deduplicated and not verified",()=>{
 const x=summarizeGdeltRiskEvents(text(),BATCH,NOW.getTime());
 assert.equal(x.rows_scanned,5);
 assert.equal(x.cameo_shortlisted,3);
 assert.equal(x.route_hint_count,2);
 assert.deepEqual(x.candidates.map(y=>y.gdelt_event_id),["1","2","4"]);
 assert.deepEqual(x.candidates[0].corridor_hints,["hormuz"]);
 assert.equal(x.candidates[0].gdelt_index_at,BATCH);
 assert.equal(x.original_event_verified,false);
 assert.equal(x.publication_time_verified,false);
 assert.equal(x.chargeable,false);
});
test("canonical D1 PUT validates item hashes, CAMEO and prevents paid event promotion",async()=>{
 const db=new DB(),p=packet();
 assert.equal(p.items.length,3);
 assert.equal(validGdeltPrivateItem(p.items[0],NOW.getTime()),true);
 const ok=await putPrivateRiskGateGdelt({DB:db},p,NOW.getTime());
 assert.equal(ok.status,200);
 const j=await ok.json();
 assert.equal(j.exact_d1_readback,3);assert.equal(j.verified_event_count,0);
 const get=await readPrivateRiskGateGdelt({DB:db},
  new URLSearchParams("limit=40"),NOW.getTime());
 const read=await get.json();
 assert.equal(read.count,3);
 assert.equal(read.entries[0].verified_event,false);
 assert.equal(read.entries.every(entry=>!Object.hasOwn(entry,"source_url")&&
  /^[a-f0-9]{64}$/u.test(entry.source_url_sha256)),true);
 const malicious=structuredClone(p);
 malicious.items[0].event_verified=true;
 assert.equal((await putPrivateRiskGateGdelt({DB:db},malicious,NOW.getTime())).status,422);
 const tampered=structuredClone(p);tampered.items[0].cameo_code="201";
 assert.equal((await putPrivateRiskGateGdelt({DB:db},tampered,NOW.getTime())).status,422);
 const sourceTamper=structuredClone(p);sourceTamper.items[0].source_url_sha256="b".repeat(64);
 assert.equal((await putPrivateRiskGateGdelt({DB:db},sourceTamper,NOW.getTime())).status,422);
});
test("bounded real ZIP producer validates MD5, D1 exact put and private get",async()=>{
 const compressed=Buffer.from("pinned zip bytes");
 const manifest={batch_at:BATCH,expected_bytes:compressed.length,
  expected_md5:createHash("md5").update(compressed).digest("hex")};
 const db=new DB();
 const got=await publishGdeltRiskEventWideNet({
  rootToken:"a".repeat(64),now:NOW,
  readArchive:async()=>({decoded:text(),manifest,zipped:compressed}),
  fetchImpl:async(url,options)=>{
   assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/u);
   if(options.method==="PUT")
    return putPrivateRiskGateGdelt({DB:db},JSON.parse(options.body),NOW.getTime());
   return readPrivateRiskGateGdelt({DB:db},
    new URLSearchParams("limit=40"),NOW.getTime());
  }
 });
 assert.equal(got.d1_shortlist_records_verified,3);
 assert.equal(got.verified_events,0);
 assert.equal(got.paid_gate_enabled,false);
 assert.equal(got.readback_valid,true);
});
test("GDELT event shortlist can never call PREDGE, paid API or replace GRO signer",()=>{
 const workflow=readFileSync(new URL("../../.github/workflows/direct-global-corridor-intake.yml",import.meta.url),"utf8");
 assert.ok(workflow.includes("publish-risk-gate-gdelt-wide-net.mjs"));
 const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(worker.indexOf("const auth = authorized(request, env)")<
  worker.indexOf('if(url.pathname==="/v1/internal/risk-gate/gdelt-event-index")'));
});

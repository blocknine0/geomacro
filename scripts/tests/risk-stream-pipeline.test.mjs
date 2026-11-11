import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {processRiskStreamBatch,enqueueRiskStreamEvents,consumeRiskStreamQueue,
 inspectRiskStreamCandidates,riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";

const digest=v=>createHash("sha256").update(v).digest("hex");
const signing=()=>generateKeyPairSync("ed25519");
const spki=x=>x.publicKey.export({type:"spki",format:"der"}).toString("base64");
const pkcs8=x=>x.privateKey.export({type:"pkcs8",format:"der"}).toString("base64");
const prove=(payload,key,scope)=>sign(null,Buffer.from(scope+"\n"+payload),
 key.privateKey).toString("base64");
class FakeDB {
 constructor(){
  this.evidence=new Map();this.gros=new Map();this.outbox=new Map();
  this.inject503=true;this.faultedBatches=new Set();this.http503Faults=0;
  this.sources=new Map([
   ["gov",{source_id:"gov",publisher_root_domain:"official.example",
    parent_media_entity:"government_official",source_role:"GOVERNMENT_WIRE",
    commercial_rights_approved:1,enabled:1,rights_expire_at:null}],
   ["region",{source_id:"region",publisher_root_domain:"regional.example",
    parent_media_entity:"regional_newspaper",source_role:"INDEPENDENT_REGIONAL",
    commercial_rights_approved:1,enabled:1,rights_expire_at:null}]
  ]);
  this.policies=new Map([
   ["GEOPOLITICS",{category:"GEOPOLITICS",required_role_a:"GOVERNMENT_WIRE",
    required_role_b:"INDEPENDENT_REGIONAL",enabled:1}],
   ["FOOD_SECURITY",{category:"FOOD_SECURITY",required_role_a:"GOVERNMENT_WIRE",
    required_role_b:"INDEPENDENT_REGIONAL",enabled:1}]
  ]);
 }
 prepare(sql){
  const db=this;
  return {
   sql,args:[],
   bind(...args){this.args=args;return this},
   async all(){
    if(sql.includes("FROM risk_stream_sources")&&!sql.includes("JOIN"))
     return {results:JSON.parse(this.args[0]).map(x=>db.sources.get(x)).filter(Boolean)};
    if(sql.includes("FROM risk_stream_category_policy"))
     return {results:JSON.parse(this.args[0]).map(x=>db.policies.get(x)).filter(Boolean)};
    if(sql.includes("WHERE observation_id IN"))
     return {results:JSON.parse(this.args[0]).map(id=>db.evidence.get(id)).filter(Boolean)};
    if(sql.includes("JOIN risk_stream_sources")){
     const fps=new Set(JSON.parse(this.args[1]));
     return {results:[...db.evidence.values()].filter(x=>
      fps.has(x.event_fingerprint)&&x.published_at>=this.args[2]&&
      x.original_verified===1&&db.sources.get(x.source_id)?.commercial_rights_approved===1)};
    }
    throw Error("FAKE_QUERY_NOT_IMPLEMENTED:"+sql.slice(0,60));
   },
   async first(){
    if(sql.includes("FROM risk_stream_signed_gro"))
     return db.gros.get(this.args[0])??null;
    throw Error("FAKE_FIRST_NOT_IMPLEMENTED");
   },
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO risk_stream_evidence")){
     const fingerprint=this.args[0];
     if(db.inject503&&!db.faultedBatches.has(fingerprint)){
      db.faultedBatches.add(fingerprint);db.http503Faults++;
      throw Error("D1_ERROR_HTTP_503_SYNTHETIC");
     }
     for(let i=0;i<this.args.length;i+=16){
      const [observation_id,country_iso3,category,event_fingerprint,
       source_id,publisher_root_domain,parent_media_entity,source_role,
       published_at,entities_json,derived_json,original_page_sha256,
       original_verified,source_url_sha256,private_r2_object_key,received_at]
       =this.args.slice(i,i+16);
      if(!db.evidence.has(observation_id))db.evidence.set(observation_id,{
       observation_id,country_iso3,category,event_fingerprint,source_id,
       publisher_root_domain,parent_media_entity,source_role,published_at,
       entities_json,derived_json,original_page_sha256,original_verified,
       source_url_sha256,private_r2_object_key,received_at
      });
     }
     return {success:true,meta:{changes:this.args.length/16}};
    }
    throw Error("FAKE_RUN_NOT_IMPLEMENTED");
   }
  };
 }
 async batch(stmts){
  assert.equal(stmts.length,2);
  const a=stmts[0].args,b=stmts[1].args;
  if(!this.gros.has(a[0]))
   this.gros.set(a[0],{gro_id:a[0],country_iso3:a[1],category:a[2],
    event_fingerprint:a[3],payload_json:a[4],payload_sha256:a[5],
    signature_b64:a[6],created_at:a[7],expires_at:a[8]});
  if(!this.outbox.has(b[0]))this.outbox.set(b[0],{
   gro_id:b[0],state:"PENDING",created_at:b[1]});
  return [{success:true},{success:true}];
 }
}
class FakeR2{
 constructor(){this.map=new Map();this.readbacks=0}
 async put(key,bytes){this.map.set(key,new Uint8Array(bytes));return {key}}
 async get(key){
  const bytes=this.map.get(key);if(!bytes)return null;
  this.readbacks++;
  return {async arrayBuffer(){return bytes.buffer.slice(
   bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}};
 }
}
function ctx(){
 const facts=signing(),rights=signing(),gro=signing(),db=new FakeDB(),r2=new FakeR2();
 const env={DB:db,RISK_STREAM_ACTIVE:"1",RISK_STREAM_QUEUE:{
  async sendBatch(messages){env.messages.push(...messages)}
 },messages:[],RISK_STREAM_PRIVATE_R2:r2,
  RISK_STREAM_AES256_KEY_B64:randomBytes(32).toString("base64"),
  RISK_STREAM_MACHINE_FACTS_SPKI_B64:spki(facts),
  RISK_STREAM_MACHINE_RIGHTS_SPKI_B64:spki(rights),
  RISK_STREAM_GRO_SIGN_PKCS8_B64:pkcs8(gro),
  RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(gro)};
 return {db,r2,env,facts,rights,gro};
}
function candidate(c,i,source,now=Date.now(),category="GEOPOLITICS",clockOffsetMs=0){
 const original=source==="gov",raw="Original verified event report for "+
  category+" "+i+" from "+source+"; direct independent original.";
 const entities=["COUNTRY:USA","EVENT:"+String(i).padStart(4,"0")];
 const derived={
  what:"Event "+i+" was reported by independent sources",
  why:"A documented policy change could affect the specified country",
  market:"Impact remains unquantified until a verified market feed reports it",
  watch:"Monitor fresh original government and regional announcements"
 };
 const item={
  schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
  country_iso3:"USA",category,feed_origin:original?"OFFICIAL_API":"RSS",
  event_key:"EVENT_"+String(i).padStart(6,"0"),entities,
  event_fingerprint:digest(JSON.stringify(["USA",category,"EVENT_"+String(i).padStart(6,"0"),entities])),
  source_id:source,source_url:"https://"+(original?"official.example":"regional.example")+"/events/"+i,
  publisher_root_domain:original?"official.example":"regional.example",
  parent_media_entity:original?"government_official":"regional_newspaper",
  source_role:original?"GOVERNMENT_WIRE":"INDEPENDENT_REGIONAL",
  published_at:new Date(now-30000+clockOffsetMs).toISOString(),
  original_page_sha256:digest(raw),derived,raw_payload:raw,proof:null
 };
 const claims=riskStreamOriginalClaims(item);
 item.proof={
  facts_signature_b64:prove(claims,c.facts,"geomacro.machine-original-facts.v1"),
  rights_signature_b64:prove(claims,c.rights,"geomacro.machine-commercial-rights.v1")
 };
 return item;
}
test("220 independent original events: 110 genuine signed GROs, one D1 multi-row INSERT per 10, simulated 503 recovered",async()=>{
 const c=ctx(),now=Date.now(),items=[];
 for(let i=0;i<110;i++)items.push(candidate(c,i,"gov",now),candidate(c,i,"region",now));
 const http=await enqueueRiskStreamEvents(c.env,{schema:"geomacro.risk-stream-ingest-batch.v1",
  items:items.slice(0,100)},now);
 assert.equal(http.status,202);
 const httpPayload=await http.json();
 assert.equal(httpPayload.status,"DURABLY_QUEUED_NOT_YET_VERIFIED");
 assert.equal(c.env.messages.length,100);
 const delays=[];
 for(let n=0;n<items.length;n+=10){
  const result=await processRiskStreamBatch(c.env,items.slice(n,n+10),{
   now,sleeper:async ms=>delays.push(ms),random:()=>0
  });
  assert.equal(result.status,"PASS");
  assert.equal(result.index_only,0);
  assert.equal(result.client_debit_enabled,false);
 }
 assert.equal(c.db.evidence.size,220);
 assert.equal(c.db.gros.size,110);
 assert.equal(c.db.outbox.size,110);
 assert.equal(c.db.http503Faults,22);
 assert.equal(delays.length,22);
 assert(c.r2.readbacks>=22);
 for(const row of c.db.gros.values()){
  const verified=await crypto.subtle.verify("Ed25519",
   await crypto.subtle.importKey("spki",Buffer.from(c.env.RISK_STREAM_GRO_VERIFY_SPKI_B64,"base64"),
    {name:"Ed25519"},false,["verify"]),
   Buffer.from(row.signature_b64,"base64"),Buffer.from(row.payload_json));
  assert.equal(verified,true);
  assert.equal(JSON.parse(row.payload_json).customer_delivery_authorized,false);
  assert.equal(row.payload_sha256,digest(row.payload_json));
 }
});
test("idempotent redrive reuses same signed GRO and outbox despite later clock",async()=>{
 const c=ctx(),now=Date.now(),items=[candidate(c,0,"gov",now),
  candidate(c,0,"region",now)];
 await processRiskStreamBatch(c.env,items,{now,sleeper:async()=>{},random:()=>0});
 await processRiskStreamBatch(c.env,items,{now:now+30000,sleeper:async()=>{},random:()=>0});
 assert.equal(c.db.evidence.size,2);
 assert.equal(c.db.gros.size,1);
 assert.equal(c.db.outbox.size,1);
});
test("unverified GDELT indexed hints never corroborate commercial originals",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,1,"gov",now),b=candidate(c,1,"region",now);
 b.kind="INDEX_ONLY";b.feed_origin="GDELT_INDEX";b.proof=null;b.raw_payload=null;
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.index_only,1);
 assert.equal(result.corroborated_and_signed,0);
 assert.equal(c.db.gros.size,0);
});
test("machine rights signature cannot be substituted by facts attestation",async()=>{
 const c=ctx(),now=Date.now(),a=candidate(c,2,"gov",now);
 a.proof.rights_signature_b64=a.proof.facts_signature_b64;
 await assert.rejects(processRiskStreamBatch(c.env,[a],{now}),
  /RISK_STREAM_ORIGINAL_OR_RIGHTS_SIGNATURE_UNVERIFIED/u);
 assert.equal(c.db.evidence.size,0);
});
test("preapproved dynamic category routes without any Hot50 hardcoded country-count logic",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,3,"gov",now,"FOOD_SECURITY");
 const b=candidate(c,3,"region",now,"FOOD_SECURITY");
 const r=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(r.corroborated_and_signed,1);
 assert.equal([...c.db.gros.values()][0].category,"FOOD_SECURITY");
});
test("publisher-parent independence is mandatory even when domains differ",async()=>{
 const c=ctx(),now=Date.now();
 c.db.sources.get("region").parent_media_entity="government_official";
 const a=candidate(c,4,"gov",now),b=candidate(c,4,"region",now);
 b.parent_media_entity="government_official";
 const claims=riskStreamOriginalClaims(b);
 b.proof.facts_signature_b64=prove(claims,c.facts,"geomacro.machine-original-facts.v1");
 b.proof.rights_signature_b64=prove(claims,c.rights,"geomacro.machine-commercial-rights.v1");
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.corroborated_and_signed,0);
});
test("52-hour separated original publications cannot pass 48-hour same-event window",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,5,"gov",now,"GEOPOLITICS",-52*3600000);
 const b=candidate(c,5,"region",now);
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.corroborated_and_signed,0);
});
test("unapproved publisher commercial rights HOLD before canonical write",async()=>{
 const c=ctx(),now=Date.now();
 c.db.sources.get("gov").commercial_rights_approved=0;
 await assert.rejects(processRiskStreamBatch(c.env,[candidate(c,6,"gov",now)],{now}),
  /RISK_STREAM_SOURCE_TRUST_OR_RIGHTS_UNVERIFIED/u);
 assert.equal(c.db.evidence.size,0);
});
test("candidate without exact original payload hash is never signed",async()=>{
 const c=ctx(),now=Date.now(),a=candidate(c,7,"gov",now);
 a.original_page_sha256="f".repeat(64);
 const claim=riskStreamOriginalClaims(a);
 a.proof.facts_signature_b64=prove(claim,c.facts,"geomacro.machine-original-facts.v1");
 a.proof.rights_signature_b64=prove(claim,c.rights,"geomacro.machine-commercial-rights.v1");
 await assert.rejects(processRiskStreamBatch(c.env,[a],{now}),
  /RISK_STREAM_ORIGINAL_OR_RIGHTS_SIGNATURE_UNVERIFIED/u);
});

test("arbitrary three-letter country can route genuine original corroboration",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,8,"gov",now),b=candidate(c,8,"region",now);
 for(const item of [a,b]){
  item.country_iso3="KEN";
  item.entities[0]="COUNTRY:KEN";
  item.event_fingerprint=digest(JSON.stringify([
   "KEN",item.category,item.event_key,item.entities
  ]));
  const claim=riskStreamOriginalClaims(item);
  item.proof.facts_signature_b64=prove(claim,c.facts,"geomacro.machine-original-facts.v1");
  item.proof.rights_signature_b64=prove(claim,c.rights,"geomacro.machine-commercial-rights.v1");
 }
 const r=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(r.corroborated_and_signed,1);
 assert.equal([...c.db.gros.values()][0].country_iso3,"KEN");
});
test("GDELT index cannot claim original status even with two forged machine attestations",async()=>{
 const c=ctx(),now=Date.now(),item=candidate(c,9,"gov",now);
 item.feed_origin="GDELT_INDEX";
 const claim=riskStreamOriginalClaims(item);
 item.proof.facts_signature_b64=prove(claim,c.facts,"geomacro.machine-original-facts.v1");
 item.proof.rights_signature_b64=prove(claim,c.rights,"geomacro.machine-commercial-rights.v1");
 await assert.rejects(inspectRiskStreamCandidates([item],now),
  /RISK_STREAM_INDEX_ONLY_DISCOVERY_NOT_ORIGINAL/u);
});

test("true 220-event producer-to-Cloudflare-Queue-to-D1-to-GRO path ACKs all messages with no 503 responses",async()=>{
 const c=ctx(),now=Date.now(),items=[],responses=[];
 c.db.inject503=false;
 for(let i=0;i<110;i++)items.push(candidate(c,i+300,"gov",now),
  candidate(c,i+300,"region",now));
 for(let i=0;i<items.length;i+=100){
  const response=await enqueueRiskStreamEvents(c.env,{
   schema:"geomacro.risk-stream-ingest-batch.v1",items:items.slice(i,i+100)
  },now);
  responses.push(response.status);
 }
 assert.deepEqual(responses,[202,202,202]);
 assert.equal(c.env.messages.length,220);
 let acked=0,retried=0;
 for(let i=0;i<c.env.messages.length;i+=10){
  const segment=c.env.messages.slice(i,i+10).map(item=>({
   body:item.body,ack(){acked++},retry(){retried++}
  }));
  const result=await consumeRiskStreamQueue({messages:segment},c.env);
  assert.equal(result.status,"PASS");
 }
 assert.equal(acked,220);assert.equal(retried,0);
 assert.equal(c.db.evidence.size,220);assert.equal(c.db.gros.size,110);
 assert.equal(c.db.outbox.size,110);
 assert.equal(c.db.http503Faults,0);
});

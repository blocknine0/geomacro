import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {processRiskStreamBatch,enqueueRiskStreamEvents,consumeRiskStreamQueue,
 inspectRiskStreamCandidates,riskStreamOriginalClaims,deriveRiskStreamEligibleScore}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {normalizeRiskStreamInternalCorroboration}
 from "../../workers/control-plane/src/risk-stream-internal-corroboration.mjs";

const digest=v=>createHash("sha256").update(v).digest("hex");
const signing=()=>generateKeyPairSync("ed25519");
const spki=x=>x.publicKey.export({type:"spki",format:"der"}).toString("base64");
const pkcs8=x=>x.privateKey.export({type:"pkcs8",format:"der"}).toString("base64");
const prove=(payload,key,scope)=>sign(null,Buffer.from(scope+"\n"+payload),
 key.privateKey).toString("base64");
test("signed eligible scores are transparent event-class heuristics across all three categories",()=>{
 const cases=[
  ["GEOPOLITICS","USA","Two reports confirm new sanctions on the country.","SANCTIONS",75],
  ["MACRO_FX","IND","The central bank announced an interest rate policy change.","MONETARY_POLICY",48],
  ["CRITICAL_MINERALS","CHL","A rare earth supply shock followed the mine closure.","MINERAL_SUPPLY_SHOCK",78]
 ];
 for(const [category,country,what,eventClass,score] of cases){
  const value=deriveRiskStreamEligibleScore(category,country,what);
  assert.deepEqual(Object.fromEntries(["country_iso3","category","value_0_100",
   "provenance","derived_only","licensed_source_text_included",
   "independent_accuracy_certified"].map(key=>[key,value[key]])),{
    country_iso3:country,category,value_0_100:score,
    provenance:"GEOMACRO_EVENT_CLASS_HEURISTIC_V1",derived_only:true,
    licensed_source_text_included:false,independent_accuracy_certified:false
   });
  assert.equal(value.event_class,eventClass);
  assert.equal(value.value_0_100,score);
  assert.equal(value.score_semantics,"EVENT_CLASS_HEURISTIC_NOT_A_VERIFIED_COUNTRY_RISK_SCORE");
  assert.equal(value.independent_accuracy_certified,false);
  assert.equal(value.licensed_source_text_included,false);
 }
 assert.equal(deriveRiskStreamEligibleScore("GEOPOLITICS","USA","A generic test event"),null);
 assert.equal(deriveRiskStreamEligibleScore("UNMAPPED","USA","Sanctions"),null);
});
test("dual-attested originals produce signed eligible_derived_score objects in all three categories",async()=>{
 const cases=[
  {category:"GEOPOLITICS",roles:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],value:75},
  {category:"MACRO_FX",roles:["OFFICIAL_STATISTICS","MARKET_PRICE"],value:48},
  {category:"CRITICAL_MINERALS",roles:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"],value:78}
 ];
 for(const [index,item] of cases.entries()){
  const c=ctx(),now=Date.now();
  c.db.sources.get("gov").source_role=item.roles[0];
  c.db.sources.get("region").source_role=item.roles[1];
  const a=candidate(c,500+index,"gov",now,item.category);
  const b=candidate(c,500+index,"region",now,item.category);
  const result=await processRiskStreamBatch(c.env,[a,b],{
   now,sleeper:async()=>{},random:()=>0
  });
  assert.equal(result.corroborated_and_signed,1,item.category);
  const row=[...c.db.gros.values()][0],payload=JSON.parse(row.payload_json);
  assert.equal(payload.eligible_derived_score.country_iso3,"USA");
  assert.equal(payload.eligible_derived_score.category,item.category);
  assert.equal(payload.eligible_derived_score.value_0_100,item.value);
  assert.deepEqual(payload.eligible_derived_score.eligible_tiers,
   ["basic_focused","standard","complex_full"]);
  assert.equal(payload.eligible_derived_score.raw_source_redacted,true);
  assert.equal(payload.eligible_derived_score.agent_decision.risk_score_0_100,item.value);
  assert.equal(payload.eligible_derived_score.analyst_brief.risk_mechanism.length>20,true);
  assert.doesNotMatch(JSON.stringify(payload.eligible_derived_score),/https?:\/\/|headline|publisher|channel/iu);
  const key=await crypto.subtle.importKey("spki",
   Buffer.from(c.env.RISK_STREAM_GRO_VERIFY_SPKI_B64,"base64"),
   {name:"Ed25519"},false,["verify"]);
  assert.equal(await crypto.subtle.verify("Ed25519",key,
   Buffer.from(row.signature_b64,"base64"),Buffer.from(row.payload_json)),true);
 }
});
test("one independently dual-attested primary plus redacted Private OSINT features qualifies Standard only",async()=>{
 const c=ctx(),now=Date.now(),item=candidate(c,991,"gov",now);
 item.risk_context=normalizeRiskStreamInternalCorroboration({
  source_kind:"PRIVATE_OSINT",country_iso3:item.country_iso3,category:item.category,
  text:"FX stress and sovereign debt distress observed in a private monitor; private title, URL, and publisher omitted",
  severity_weight:68,corroboration_weight:0.7,corridors:["USA>IND"]
 });
 const claims=riskStreamOriginalClaims(item);
 item.proof.facts_signature_b64=prove(claims,c.facts,"geomacro.machine-original-facts.v1");
 item.proof.rights_signature_b64=prove(claims,c.rights,"geomacro.machine-commercial-rights.v1");
 const out=await processRiskStreamBatch(c.env,[item],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(out.corroborated_and_signed,1);
 const payload=JSON.parse([...c.db.gros.values()][0].payload_json);
 assert.equal(payload.source_originals.length,1);
 assert.deepEqual(payload.eligible_derived_score.eligible_tiers,["basic_focused","standard"]);
 assert.equal(payload.evidence_and_confidence.internal_corroboration.raw_source_redacted,true);
 assert.deepEqual(payload.evidence_and_confidence.internal_corroboration.families,["PRIVATE_OSINT"]);
 assert.deepEqual(payload.eligible_derived_score.agent_decision.contagion_corridors,[]);
 assert.doesNotMatch(JSON.stringify(payload),/private title|publisher omitted|https?:\/\/|headline/iu);
});

test("two independent rights-approved originals qualify Standard and Complex without mandatory role-pair matching",async()=>{
 const c=ctx(),now=Date.now();
 c.db.sources.get("region").source_role="GOVERNMENT_WIRE";
 const a=candidate(c,1901,"gov",now),b=candidate(c,1901,"region",now+1000,"GEOPOLITICS",0,"GOVERNMENT_WIRE");
 const out=await processRiskStreamBatch(c.env,[a,b],{now:now+2000,sleeper:async()=>{},random:()=>0});
 assert.equal(out.corroborated_and_signed,1);
 const payload=JSON.parse([...c.db.gros.values()][0].payload_json);
 assert.equal(payload.source_originals.length,2);
 assert.deepEqual(payload.eligible_derived_score.eligible_tiers,
  ["basic_focused","standard","complex_full"]);
});
class FakeDB {
 constructor(){
  this.evidence=new Map();this.gros=new Map();this.outbox=new Map();
  this.inject503=true;this.faultedBatches=new Set();this.http503Faults=0;
  this.secondaryIndex=[];
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
    required_role_b:"INDEPENDENT_REGIONAL",enabled:1}],
   ["MACRO_FX",{category:"MACRO_FX",required_role_a:"OFFICIAL_STATISTICS",
    required_role_b:"MARKET_PRICE",enabled:1}],
   ["CRITICAL_MINERALS",{category:"CRITICAL_MINERALS",required_role_a:"TRADE_CUSTOMS",
    required_role_b:"INDEPENDENT_INDUSTRY",enabled:1}]
  ]);
 }
 prepare(sql){
  const db=this;
  return {
   sql,args:[],
   bind(...args){this.args=args;return this},
   async all(){
    if(sql.includes("FROM progressive_risk_gate_facts"))
     return {results:db.secondaryIndex};
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
  if(stmts[0]?.sql?.startsWith("INSERT OR IGNORE INTO risk_stream_evidence")){
   // Provider D1 limit: <=100 bound parameters PER statement. One Queue
   // batch of 10 originals must be 6+4 rows inside this atomic DB batch.
   assert(stmts.length>=1&&stmts.length<=2);
   assert(stmts.every(x=>x.args.length<=100&&x.args.length%16===0));
   const first=stmts[0].args[0];
   if(this.inject503&&!this.faultedBatches.has(first)){
    this.faultedBatches.add(first);this.http503Faults++;
    throw Error("D1_ERROR_HTTP_503_SYNTHETIC");
   }
   const wasInjected=this.inject503;
   this.inject503=false;
   try{for(const stmt of stmts)await stmt.run()}
   finally{this.inject503=wasInjected}
   return stmts.map(()=>({success:true}));
  }
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
 const env={DB:db,RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",RISK_STREAM_QUEUE:{
  async sendBatch(messages){env.messages.push(...messages)}
 },messages:[],RISK_STREAM_PRIVATE_R2:r2,
  RISK_STREAM_AES256_KEY_B64:randomBytes(32).toString("base64"),
  RISK_STREAM_MACHINE_FACTS_SPKI_B64:spki(facts),
  RISK_STREAM_MACHINE_RIGHTS_SPKI_B64:spki(rights),
  RISK_STREAM_GRO_SIGN_PKCS8_B64:pkcs8(gro),
  RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(gro)};
 return {db,r2,env,facts,rights,gro};
}
function candidate(c,i,source,now=Date.now(),category="GEOPOLITICS",clockOffsetMs=0,roleOverride=null){
 const original=source==="gov",raw="Original verified event factual record for "+
  category+" "+i+" from "+source+"; direct independent original. Open Government Licence v3 "+
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
 const entities=["COUNTRY:USA","EVENT:"+String(i).padStart(4,"0")];
 const categoryRoles={GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
  MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
  CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]};
 const roles=categoryRoles[category]??categoryRoles.GEOPOLITICS;
 const what=category==="MACRO_FX"?
  "The central bank announced an interest rate policy change":
  category==="CRITICAL_MINERALS"?
   "A rare earth supply shock followed the mine closure":
   "New sanctions were announced for the country";
 const derived={
  what,
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
  source_role:roleOverride??roles[original?0:1],
  published_at:new Date(now-30000+clockOffsetMs).toISOString(),
  original_page_sha256:digest(raw),derived,raw_payload:raw,proof:null,
  rights_verification:{registry_source_id:source,registry_enabled:true,
   registry_commercial_rights_approved:true,
   authorization_reference:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ | https://www.gov.uk/help/terms-conditions",
   independent_reviewer_id:"synthetic-test-fixture",checked_at_utc:new Date(now).toISOString(),
   rights_expires_at_utc:new Date(now+365*86400000).toISOString(),
   item_license_evidence:{license_id:"UK_OGL_V3",
    license_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    terms_url:"https://www.gov.uk/help/terms-conditions",
    item_url:"https://"+(original?"official.example":"regional.example")+"/events/"+i,
    item_license_marker:"Open Government Licence v3",
    publisher_owned_content_only:true,third_party_exceptions:false,
    non_commercial:false,restricted_material:false,factual_record_only:true,
    original_text_republished:false}}
 };
 const claims=riskStreamOriginalClaims(item);
 item.proof={
  facts_signature_b64:prove(claims,c.facts,"geomacro.machine-original-facts.v1"),
  rights_signature_b64:prove(claims,c.rights,"geomacro.machine-commercial-rights.v1")
 };
 return item;
}
test("220 independent original events: 110 genuine signed GROs, one atomic D1 6+4 multi-row batch at <=100 binds/SQL, simulated 503 recovered",async()=>{
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
test("unverified GDELT indexed hints cannot elevate single originals beyond Basic",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,1,"gov",now),b=candidate(c,1,"region",now);
 b.kind="INDEX_ONLY";b.feed_origin="GDELT_INDEX";b.proof=null;b.raw_payload=null;
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.index_only,1);
 assert.equal(result.corroborated_and_signed,1);
 const payload=JSON.parse([...c.db.gros.values()][0].payload_json);
 assert.deepEqual(payload.source_originals,[payload.source_originals[0]]);
 assert.deepEqual(payload.eligible_derived_score.eligible_tiers,["basic_focused"]);
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
test("publisher-parent independence is mandatory for Standard and Complex, not Basic",async()=>{
 const c=ctx(),now=Date.now();
 c.db.sources.get("region").parent_media_entity="government_official";
 const a=candidate(c,4,"gov",now),b=candidate(c,4,"region",now);
 b.parent_media_entity="government_official";
 const claims=riskStreamOriginalClaims(b);
 b.proof.facts_signature_b64=prove(claims,c.facts,"geomacro.machine-original-facts.v1");
 b.proof.rights_signature_b64=prove(claims,c.rights,"geomacro.machine-commercial-rights.v1");
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.corroborated_and_signed,1);
 const payload=JSON.parse([...c.db.gros.values()][0].payload_json);
 assert.deepEqual(payload.source_originals.length,1);
 assert.deepEqual(payload.eligible_derived_score.eligible_tiers,["basic_focused"]);
});
test("one independently dual-attested open-license observation signs Basic in each category",async()=>{
 const cases=[
  ["GEOPOLITICS","GOVERNMENT_WIRE","SANCTIONS_POLICY: jurisdictional restrictions tighten."],
  ["MACRO_FX","OFFICIAL_STATISTICS","CENTRAL_BANK_POLICY: monetary stance or policy settings change."],
  ["CRITICAL_MINERALS","TRADE_CUSTOMS","CRITICAL_MINERAL_SUPPLY: material availability or supply-chain terms change."]
 ];
 for(const [index,[category,role,what]] of cases.entries()){
  const c=ctx(),now=Date.now();c.db.sources.get("gov").source_role=role;
  const a=candidate(c,700+index,"gov",now,category);a.derived.what=what;
  const claims=riskStreamOriginalClaims(a);
  a.proof={facts_signature_b64:prove(claims,c.facts,"geomacro.machine-original-facts.v1"),
   rights_signature_b64:prove(claims,c.rights,"geomacro.machine-commercial-rights.v1")};
  const result=await processRiskStreamBatch(c.env,[a],{now,sleeper:async()=>{},random:()=>0});
  assert.equal(result.corroborated_and_signed,1,category);
  const gro=JSON.parse([...c.db.gros.values()][0].payload_json);
  assert.equal(gro.evidence_and_confidence.factual_confidence,"SINGLE_VERIFIED_ORIGINAL");
  assert.deepEqual(gro.eligible_derived_score.eligible_tiers,["basic_focused"]);
  assert.equal(gro.execution_authorized,false);
 }
});
test("52-hour separated originals remain separate Basic observations",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,5,"gov",now,"GEOPOLITICS",-52*3600000);
 const b=candidate(c,5,"region",now);
 const result=await processRiskStreamBatch(c.env,[a,b],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.corroborated_and_signed,1);
 const payload=JSON.parse([...c.db.gros.values()][0].payload_json);
 assert.equal(payload.source_originals.length,1);
 assert.deepEqual(payload.eligible_derived_score.eligible_tiers,["basic_focused"]);
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

test("distinct original wording corroborates the same attested event key without syndication",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,501,"gov",now),b=candidate(c,501,"region",now);
 b.derived.why="Independent regional reporting explains the local consequence differently";
 b.derived.watch="Watch direct regulatory filings and formal regional updates";
 const claims=riskStreamOriginalClaims(b);
 b.proof.facts_signature_b64=prove(claims,c.facts,"geomacro.machine-original-facts.v1");
 b.proof.rights_signature_b64=prove(claims,c.rights,"geomacro.machine-commercial-rights.v1");
 assert.notEqual(a.derived.why,b.derived.why);
 assert.equal(a.event_fingerprint,b.event_fingerprint);
 const result=await processRiskStreamBatch(c.env,[a,b],{
  now,sleeper:async()=>{},random:()=>0
 });
 assert.equal(result.corroborated_and_signed,1);
 assert.equal(c.db.gros.size,1);
});
test("matching entities but different attested event keys stay separate Basic observations",async()=>{
 const c=ctx(),now=Date.now();
 const a=candidate(c,502,"gov",now),b=candidate(c,502,"region",now);
 b.event_key="EVENT_DIFFERENT_0502";
 b.event_fingerprint=digest(JSON.stringify([
  b.country_iso3,b.category,b.event_key,b.entities
 ]));
 const claims=riskStreamOriginalClaims(b);
 b.proof.facts_signature_b64=prove(claims,c.facts,"geomacro.machine-original-facts.v1");
 b.proof.rights_signature_b64=prove(claims,c.rights,"geomacro.machine-commercial-rights.v1");
 const result=await processRiskStreamBatch(c.env,[a,b],{
  now,sleeper:async()=>{},random:()=>0
 });
 assert.equal(result.corroborated_and_signed,2);
 assert.equal(c.db.gros.size,2);
 assert.ok([...c.db.gros.values()].every(row=>JSON.parse(row.payload_json).source_originals.length===1));
});

test("bounded secondary news index never contributes source evidence while one original yields Basic",async()=>{
 const c=ctx(),now=Date.now(),a=candidate(c,503,"gov",now);
 c.db.secondaryIndex=[{country_iso3:"USA",category:"geopolitics",
  event_fingerprint:"f".repeat(64),publisher_domain:"regional.example",
  clock_basis:"INDEX_OBSERVED",extracted_entities_json:JSON.stringify(a.entities)}];
 const result=await processRiskStreamBatch(c.env,[a],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(result.secondary_index_same_entity_hint_count,1);
 assert.equal(result.secondary_index_publisher_hints_never_certification,true);
 assert.equal(result.corroborated_and_signed,1);
 assert.equal(c.db.gros.size,1);
 assert.deepEqual(JSON.parse([...c.db.gros.values()][0].payload_json).eligible_derived_score.eligible_tiers,
  ["basic_focused"]);
});

test("real GDELT index-only shadow path cannot require or mint independent rights signatures",async()=>{
 const c=ctx(),now=Date.now(),e=candidate(c,801,"gov",now);
 e.kind="INDEX_ONLY";e.feed_origin="GDELT_INDEX";e.proof=null;e.raw_payload=null;
 e.source_id="gdelt_untrusted_index_source";
 c.db.sources.delete("gov");
 delete c.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64;
 delete c.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64;
 const r=await processRiskStreamBatch(c.env,[e],{now,sleeper:async()=>{},random:()=>0});
 assert.equal(r.accepted,1);
 assert.equal(r.index_only,1);
 assert.equal(r.corroborated_and_signed,0);
 assert.equal(c.db.evidence.size,1);
 assert.equal(c.db.gros.size,0);
});

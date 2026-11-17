import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {generateKeyPairSync,createHash} from "node:crypto";
import factsWorker from "../../workers/risk-stream-facts-attester/src/index.mjs";
import rightsWorker from "../../workers/risk-stream-rights-attester/src/index.mjs";
import reviewerWorker from "../../workers/geomacro-release-reviewer/src/index.mjs";
import {emitRiskStreamCandidates} from "../ops/emit-risk-stream-candidates.mjs";
import {enqueueRiskStreamEvents,consumeRiskStreamQueue,riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {runCommercialIssuerTick} from "../../workers/control-plane/src/risk-stream-commercial-issuer.mjs";
import {predgePaidRiskGateD1,readPredgePullLicense} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";
import {verifyGeoMacroCommercialLicense} from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";
import {canonicalProgressiveJson} from "../../workers/control-plane/src/progressive-risk-gate.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");
const keypair=()=>generateKeyPairSync("ed25519");
const pkcs8=pair=>pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64");
const spki=pair=>pair.publicKey.export({format:"der",type:"spki"}).toString("base64");

class LocalD1 {
 constructor(){this.native=new DatabaseSync(":memory:");}
 prepare(sql){
  const db=this;let args=[];
  const bound={sql,bind(...values){args=values;return this;},
   async run(){
    const info=db.native.prepare(sql).run(...args);
    return {success:true,meta:{changes:Number(info.changes),last_row_id:Number(info.lastInsertRowid??0)}};
   },
   async first(){return db.native.prepare(sql).get(...args)??null;},
   async all(){return {results:db.native.prepare(sql).all(...args)};}
  };
  return bound;
 }
 async batch(statements){
  this.native.exec("BEGIN");
  try{const results=[];for(const statement of statements)results.push(await statement.run());
   this.native.exec("COMMIT");return results;
  }catch(error){this.native.exec("ROLLBACK");throw error;}
 }
 close(){this.native.close();}
}

const US_PD="https://www.usa.gov/government-works";
const OGL="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const CC3="https://creativecommons.org/licenses/by/3.0/";
const ECB="https://www.ecb.europa.eu/home/html/disclaimer.en.html";
const REVIEWED="2026-11-15T00:00:00.000Z";
const EXPIRY="2027-11-15";
const CATEGORIES=[
 {category:"GEOPOLITICS",input:"geopolitics",eventType:"sanctions_policy",roles:[
  {id:"geo_us_wire",domain:"state.gov",parent:"us_state_department",role:"GOVERNMENT_WIRE",license:"US_GOV_PUBLIC_DOMAIN",url:US_PD,terms:US_PD,marker:"U.S. Government work",payload:`U.S. Government work ${US_PD}; factual sanctions record.`},
  {id:"geo_regional",domain:"globalvoices.org",parent:"global_voices",role:"INDEPENDENT_REGIONAL",license:"CC_BY_3.0",url:CC3,terms:"https://globalvoices.org/about/global-voices-attribution-policy/",marker:"CC BY 3.0",payload:`CC BY 3.0 ${CC3}; publisher-owned factual record.`}
 ]},
 {category:"MACRO_FX",input:"macro",eventType:"central_bank_policy",roles:[
  {id:"macro_stats",domain:"federalreserve.gov",parent:"us_federal_reserve",role:"OFFICIAL_STATISTICS",license:"US_GOV_PUBLIC_DOMAIN",url:US_PD,terms:US_PD,marker:"U.S. Government work",payload:`U.S. Government work ${US_PD}; policy rate observation.`},
  {id:"macro_market",domain:"ecb.europa.eu",parent:"european_central_bank",role:"MARKET_PRICE",license:"ECB_REFERENCE_STATISTICS",url:ECB,terms:ECB,marker:"ECB reference statistics, values unmodified",payload:JSON.stringify({schema:"geomacro.ecb.reference-statistic.v1",license_notice_url:ECB,license_marker:"ECB reference statistics, values unmodified",series_key:"USD_EUR_REFERENCE",observed_at:"2026-11-15T04:59:00.000Z",published_at:"2026-11-15T04:59:00.000Z",value:1.08,unit:"rate",reference_currency:"EUR",counter_currency:"USD"})}
 ]},
 {category:"CRITICAL_MINERALS",input:"critical_minerals",eventType:"critical_mineral_supply",roles:[
  {id:"minerals_trade",domain:"usgs.gov",parent:"us_geological_survey",role:"TRADE_CUSTOMS",license:"US_GOV_PUBLIC_DOMAIN",url:US_PD,terms:US_PD,marker:"U.S. Government work",payload:`U.S. Government work ${US_PD}; mineral supply observation.`},
  {id:"minerals_industry",domain:"bgs.ac.uk",parent:"british_geological_survey",role:"INDEPENDENT_INDUSTRY",license:"UK_OGL_V3",url:OGL,terms:"https://www.gov.uk/help/terms-conditions",marker:"Open Government Licence v3",payload:`Open Government Licence v3 ${OGL}; factual mineral production record.`}
 ]}
];
function rightEntry(source){
 return {source_id:source.id,publisher_root_domain:source.domain,
  parent_media_entity:source.parent,source_role:source.role,
  categories:[source.category],status:"APPROVED",rights_expire_at:EXPIRY,
  rights_evidence:{licence_url:source.url,terms_url:source.terms,reviewed_at:REVIEWED,
   reviewer:"local-composed-e2e-fixture",notes:"Reviewed test rights evidence for item-level guard integration."}};
}
function original(source,category,eventType,now){
 const sourceUrl=`https://${source.domain}/events/${category.toLowerCase()}`;
 const publishedAt=new Date(now-60_000).toISOString();
 const eventIdentity={country_iso3:"USA",event_type:eventType,actor_id:"us_policy_authority",
  target_id:"affected_market",location_id:"sector_corridor",occurred_at:publishedAt};
 const what=category==="GEOPOLITICS"?"New sanctions policy changes market access for the country":
  category==="MACRO_FX"?"The central bank changed its interest rate policy":
   "A critical mineral supply disruption affects production";
 return {category,country_iso3:"USA",feed_origin:"OFFICIAL_API",source_id:source.id,
  source_role:source.role,publisher_root_domain:source.domain,parent_media_entity:source.parent,
  source_url:sourceUrl,published_at:publishedAt,event_identity: eventIdentity,
  raw_payload:source.payload,
  item_license_evidence:{license_id:source.license,license_url:source.url,terms_url:source.terms,
   item_url:sourceUrl,item_license_marker:source.marker,
   publisher_owned_content_only:["UK_OGL_V3","US_GOV_PUBLIC_DOMAIN"].includes(source.license),
   third_party_exceptions:false,non_commercial:false,restricted_material:false,
   factual_record_only:true,original_text_republished:false},
  reporting_position:"confirms",derived:{what,why:"A verified policy or supply condition may affect commercial exposure",
   market:"Potential market transmission requires continuous validation",
   watch:"Monitor fresh official observations and independent corroboration"}};
}

test("composed verified-original -> dual attesters -> signed GRO -> reviewer -> paid Predge covers 3 categories x 3 tiers",async()=>{
 const now=Date.now(),db=new LocalD1();
 try{
  for(const file of readdirSync("workers/control-plane/migrations").filter(x=>/^\d+.*\.sql$/u.test(x)).sort())
   db.native.exec(readFileSync(`workers/control-plane/migrations/${file}`,"utf8"));
  const pairs={facts:keypair(),rights:keypair(),gro:keypair(),license:keypair(),review:keypair(),decision:keypair()};
  const manifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",
   entries:CATEGORIES.flatMap(group=>group.roles.map(source=>rightEntry({...source,category:group.category})))};
  const rows=manifest.entries;
  for(const row of rows)db.native.prepare("INSERT INTO risk_stream_sources(source_id,publisher_root_domain,parent_media_entity,source_role,commercial_rights_approved,enabled,reviewed_at,rights_expire_at) VALUES(?,?,?,?,1,1,?,?)")
   .run(row.source_id,row.publisher_root_domain,row.parent_media_entity,row.source_role,REVIEWED,EXPIRY);
  const receipt="a".repeat(64),client="predge-paid-risk-gate-addendum-v2";
  const entitlementExpiry=new Date(now+2*3600_000).toISOString();
  db.native.prepare("INSERT INTO risk_stream_commercial_subscriptions(client_id,endpoint_url,approved_host,enabled,entitlement_expires_at,approved_at,release_receipt_sha256) VALUES(?,?,?,1,?,?,?)")
   .run(client,"https://predge.example.test/accept","predge.example.test",entitlementExpiry,new Date(now).toISOString(),receipt);

  const queue=[];
  const groEnv={DB:db,RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
   RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"0",GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",
   RISK_STREAM_CANARY_HOLD_CLEARED:"1",RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"1",
   RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:receipt,
   RISK_STREAM_GRO_SIGN_PKCS8_B64:pkcs8(pairs.gro),RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(pairs.gro),
   RISK_STREAM_MACHINE_FACTS_SPKI_B64:spki(pairs.facts),RISK_STREAM_MACHINE_RIGHTS_SPKI_B64:spki(pairs.rights),
   RISK_STREAM_AES256_KEY_B64:Buffer.alloc(32,7).toString("base64"),
   RISK_STREAM_PRIVATE_R2:{objects:new Map(),async put(key,value){this.objects.set(key,new Uint8Array(value));},async get(key){const bytes=this.objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;}},
   RISK_STREAM_QUEUE:{async sendBatch(messages){queue.push(...messages);}}};
  const reviewerEnv={DB:db,GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
   RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"1",PREDGE_PAID_CUSTOMER_ENTITLEMENT_VERIFIED:"1",
   PREDGE_PAID_GO_LIVE_APPROVED:"1",RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:receipt,
   GEOMACRO_RELEASE_REVIEW_PRIVATE_PKCS8_B64:pkcs8(pairs.review),
   GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64:spki(pairs.review),
   RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(pairs.gro)};
  groEnv.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64=pkcs8(pairs.license);
  groEnv.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64=spki(pairs.license);
  groEnv.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64=spki(pairs.review);
  groEnv.GEOMACRO_RELEASE_REVIEWER={fetch:async(url,init)=>reviewerWorker.fetch(new Request(url,init),reviewerEnv,now)};

  const sourceRegistry=rows.map(row=>({...row,enabled:1,commercial_rights_approved:1}));
  const originals=CATEGORIES.flatMap(group=>group.roles.map(source=>original(source,group.category,group.eventType,now)));
  const redactedContexts=new Map();
  for(const group of CATEGORIES){
   // The fixture deliberately starts with private signal text; only normalized
   // categorical features are allowed to cross into the signed candidate.
   const {normalizeRiskStreamInternalCorroboration}=await import("../../workers/control-plane/src/risk-stream-internal-corroboration.mjs");
   redactedContexts.set(group.category,normalizeRiskStreamInternalCorroboration({source_kind:"PRIVATE_OSINT",
    country_iso3:"USA",category:group.category,text:"Private watch confirms policy or supply stress; source title and URL withheld",
    severity_weight:62,corroboration_weight:.6,corridors:["USA>GBR"]}));
  }
  const controlFetch=async(url,init)=>{
   const path=new URL(url).pathname;
   if(path==="/v1/internal/risk-stream/runtime")return Response.json({ok:true,
    schema:"geomacro.risk-stream-runtime-status.v1",ready:true,deployed_source_sha:null});
   const packet=init.body?JSON.parse(init.body):{};
   if(path==="/v1/internal/risk-stream/attest"){
    const draft=packet.draft,context=redactedContexts.get(draft.category);
    const attested={...draft,risk_context:context};
    const factsRequest=new Request("https://facts.internal/v1/attest",{method:"POST",
     headers:{Authorization:"Bearer "+"f".repeat(64),"content-type":"application/json"},body:JSON.stringify(attested)});
    const rightsRequest=new Request("https://rights.internal/v1/attest",{method:"POST",
     headers:{Authorization:"Bearer "+"r".repeat(64),"content-type":"application/json"},body:JSON.stringify(attested)});
    const [f,r]=await Promise.all([factsWorker.fetch(factsRequest,{FACTS_ATTESTER_BEARER_TOKEN:"f".repeat(64),FACTS_ATTESTER_PKCS8_B64:pkcs8(pairs.facts)},now),
     rightsWorker.fetch(rightsRequest,{RIGHTS_ATTESTER_BEARER_TOKEN:"r".repeat(64),RIGHTS_ATTESTER_PKCS8_B64:pkcs8(pairs.rights),SOURCE_REGISTRY_READONLY:db},now)]);
    const [fb,rb]=await Promise.all([f.json(),r.json()]);
    assert.equal(f.ok,true,JSON.stringify(fb));assert.equal(r.ok,true,JSON.stringify(rb));
    return Response.json({ok:true,proof:{...fb.proof,...rb.proof},risk_context:context});
   }
   if(path==="/v1/internal/risk-stream/events"){
    const result=await enqueueRiskStreamEvents(groEnv,packet,now);
    return new Response(await result.text(),{status:result.status,headers:{"content-type":"application/json"}});
   }
   assert.equal(path,"/v1/internal/risk-stream/readback");
   if(!consumed){
    queueMessages=queue.map(message=>({body:message.body,ack(){this.acked=true;},retry(){this.retried=true;}}));
    consumed=await consumeRiskStreamQueue({messages:queueMessages},groEnv);
   }
   const found=packet.observation_ids.filter(id=>db.native.prepare(
    "SELECT observation_id FROM risk_stream_evidence WHERE observation_id=?").get(id));
   return Response.json({ok:true,requested:packet.observation_ids.length,
    readback_count:found.length,readback_verified:found.length===packet.observation_ids.length,
    observation_ids:found});
  };
  let queueMessages,consumed;
  const emitted=await emitRiskStreamCandidates({originals,sourceRegistry,rightsManifest:manifest,now,
   dryRun:false,controlPlaneUrl:"https://control-plane.example",controlPlaneToken:"c".repeat(64),
   factsPublicB64:spki(pairs.facts),rightsPublicB64:spki(pairs.rights),fetchImpl:controlFetch,sleepImpl:async()=>{}});
  assert.equal(emitted.status,"POSTED");assert.equal(emitted.candidate_count,6);
  assert.equal(queue.length,6);
  queueMessages??=queue.map(message=>({body:message.body,ack(){this.acked=true;},retry(){this.retried=true;}}));
  consumed??=await consumeRiskStreamQueue({messages:queueMessages},groEnv);
  assert.equal(consumed.status,"PASS");assert.equal(consumed.corroborated_and_signed,3);
  assert(queueMessages.every(message=>message.acked&&!message.retried));
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM risk_stream_evidence").get().n,6);
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM risk_stream_signed_gro").get().n,3);

  const issuerNow=now+5000;
  const issued=await runCommercialIssuerTick(groEnv,{now:issuerNow});
  assert.equal(issued.issued,3,JSON.stringify({issued,jobs:db.native.prepare("SELECT * FROM risk_stream_commercial_issuer_jobs").all()}));
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM risk_stream_commercial_issuer_jobs WHERE state='ISSUED'").get().n,3);
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM risk_stream_signed_gro WHERE json_extract(payload_json,'$.customer_delivery_authorized')=1").get().n,3);
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM risk_stream_predge_pull_licenses").get().n,3);
  const savedGros=db.native.prepare("SELECT payload_json,signature_b64 FROM risk_stream_signed_gro WHERE json_extract(payload_json,'$.customer_delivery_authorized')=0").all();
  assert.equal(savedGros.length,3);
  for(const row of savedGros){
   const payload=JSON.parse(row.payload_json);
   assert.equal(payload.eligible_derived_score.licensed_source_text_included,false);
   assert.equal(payload.eligible_derived_score.raw_source_redacted,true);
   assert.equal(payload.evidence_and_confidence.raw_sources_not_republished,true);
   assert.equal(payload.evidence_and_confidence.raw_source_redacted,true);
   assert.doesNotMatch(row.payload_json,/state\.gov|globalvoices|federalreserve|ecb\.europa|usgs\.gov|bgs\.ac\.uk|U\.S\. Government work|Private watch|source title/iu);
  }

  // Paid switches are scoped to this in-memory test object. No config or live
  // Wrangler variables are changed by the test.
  const paidEnv={...groEnv,DB:db,PREDGE_PAID_RISK_GATE_TOKEN:"b".repeat(64),
   PREDGE_PAID_TRAFFIC_ENABLED:"YES",PREDGE_PAID_GO_LIVE_CROSSCHECK:"PASS",
   RISK_GATE_DECISION_ED25519_KEY_ID:"geomacro-e2e-local",
   RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:pkcs8(pairs.decision),
   RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:spki(pairs.decision),
   RISK_GATE_OBSERVATION_HMAC_KEY:"h".repeat(64)};
  const pullCheck=await readPredgePullLicense(paidEnv,{subject:{type:"country",id:"USA"},tier:"basic_focused",category:"geopolitics"},issuerNow);
  assert.ok(pullCheck,"reviewed pull license failed its live endpoint verifier");
  const paidRequest=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
  let accepted=0;
  for(const group of CATEGORIES)for(const tier of ["basic_focused","standard","complex_full"]){
   const request={...paidRequest,request_id:`e2e-${group.category.toLowerCase()}-${tier}`,
    tier,category:group.input};
   const response=await predgePaidRiskGateD1(new Request("https://control-plane.example/v2/partner/predge/paid-risk-gate",{
    method:"POST",headers:{authorization:"Bearer "+paidEnv.PREDGE_PAID_RISK_GATE_TOKEN,"content-type":"application/json"},
    body:JSON.stringify(request)}),paidEnv,issuerNow);
   const body=await response.json();
   assert.equal(response.status,200,JSON.stringify({category:group.category,tier,body}));
   assert.equal(body.entry_status,"DELIVERED");assert.equal(body.billable,true);
   assert.equal(body.tier,tier);assert.equal(body.channel,"predge_b2b");
   assert.ok(body.verdict_id);assert.ok(body.decision_signed_payload);
   assert.equal(body.decision_signed_payload.agent_decision.action_posture!==undefined,true);
   assert.equal(body.decision_signed_payload.analyst_brief.risk_mechanism.length>8,true);
   assert.ok(body.geomacro_commercial_license);assert.ok(body.licensed_gro_id);
   const licensePayload=body.geomacro_commercial_license.payload;
   assert.equal(licensePayload.original_publisher_text_included,false);
   assert.equal(licensePayload.eligible_derived_score.licensed_source_text_included,false);
   const verifiedLicense=await verifyGeoMacroCommercialLicense(body.geomacro_commercial_license,{now:issuerNow,
    trustedLicensePublicSpkiB64:paidEnv.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
    trustedGroPublicSpkiB64:paidEnv.RISK_STREAM_GRO_VERIFY_SPKI_B64});
   assert.equal(body.license_payload_sha256,verifiedLicense.payload_sha256);
   const key=await crypto.subtle.importKey("spki",Buffer.from(paidEnv.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64,"base64"),{name:"Ed25519"},false,["verify"]);
   assert.equal(await crypto.subtle.verify("Ed25519",key,Buffer.from(body.decision_signature_b64,"base64"),new TextEncoder().encode(canonicalProgressiveJson(body.decision_signed_payload))),true);
   const ledger=db.native.prepare("SELECT verdict_id,tier,billable,entry_status,response_sha256 FROM predge_paid_risk_gate_usage_ledger WHERE verdict_id=?").get(body.verdict_id);
   assert.equal(ledger?.tier,tier);assert.equal(ledger?.billable,1);assert.equal(ledger?.entry_status,"DELIVERED");
   assert.match(ledger.response_sha256,/^[a-f0-9]{64}$/u);
   const mutationTier=tier==="standard"?"complex_full":"standard";
   assert.throws(()=>db.native.prepare("UPDATE predge_paid_risk_gate_usage_ledger SET tier=? WHERE verdict_id=?").run(mutationTier,body.verdict_id));
   accepted++;
  }
  assert.equal(accepted,9);
  assert.equal(db.native.prepare("SELECT count(*) AS n FROM predge_paid_risk_gate_usage_ledger WHERE billable=1 AND entry_status='DELIVERED'").get().n,9);
 }finally{db.close();}
});

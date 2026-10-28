import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 NEWS_GRI_SCHEMA,NEWS_GRI_METHOD,certifiedNewsSeverityGriFromSignals,
 serveSelfCertifiedNewsSeverityGri,
} from "../../workers/control-plane/src/geomacro-news-severity-gri.mjs";

const NOW=Date.parse("2026-10-28T16:30:00.000Z");
const SECRET="geo-macro-news-grading-test-secret-".repeat(2);
function example(category,id,topic,minutes=20,status="official_release_observed_unscored"){
 return {
  id:category+"-"+id,
  category,
  title:"Geomacro finds "+topic+" official release requiring a news severity assessment",
  what_changed:"The publisher issued an official release concerning "+topic+" in the selected category.",
  why_it_matters:"This documented official release may influence monitored conditions without proving actual impact.",
  topic,geography:"United States",development_type:"risk update",
  published_at:new Date(NOW-minutes*60000).toISOString(),
  date_precision:"exact",observed_release_count:1,
  sources_credited:["Official Publisher"],status,
  same_event_corrob_verified:false,severity:null
 };
}
const SOURCE=[
 example("geopolitics","00000001","geopolitical security"),
 example("geopolitics","00000002","foreign policy",190),
 example("macro","00000003","monetary policy"),
 example("rare_earth","00000004","critical-minerals policy"),
];
test("GeoMacro HMAC signs exact three-domain 0–100 news-severity calculation",async()=>{
 const r=await certifiedNewsSeverityGriFromSignals(SOURCE,{now:NOW,secret:SECRET});
 assert.equal(r.schema,NEWS_GRI_SCHEMA);
 assert.equal(r.issuer,"GeoMacro");
 assert.equal(r.scope,"GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY");
 assert.equal(r.independent_third_party_certified,false);
 assert.equal(r.source_event_facts_independently_verified,false);
 assert.equal(r.data.proofScope,"geomacro-news-severity");
 assert.equal(r.data.parentMethodologyVersion,NEWS_GRI_METHOD);
 assert.deepEqual(r.data.indices.map(x=>x.key),
  ["geopolitics","macro","critical_minerals"]);
 assert.ok(r.data.indices.every(x=>x.status==="available"&&
   Number.isFinite(x.score)&&x.score>0&&x.score<=100));
 const {certification,...unsigned}=r;
 const serialized=JSON.stringify(unsigned);
 assert.equal(certification.signed_payload_sha256,
  createHash("sha256").update(serialized).digest("hex"));
 assert.equal(certification.signature_hex,
  createHmac("sha256",SECRET).update(
   "GEOMACRO/SELF-CERTIFIED/NEWS-SEVERITY-GRI/v1\\n"+serialized).digest("hex"));
 assert.equal(r.data.indices.find(x=>x.key==="geopolitics").eventCount,2);
 assert.equal(r.data.indices.find(x=>x.key==="geopolitics").sourceCount,1);
 assert.equal(r.data.indices.find(x=>x.key==="geopolitics").independentStoryCount,0);
 assert.equal(r.data.indices.find(x=>x.key==="geopolitics").series["30D"].buckets,null);
 assert.equal(r.data.indices.find(x=>x.key==="macro").series["7D"].buckets,null);
 assert.equal(r.observed_osint_input_count,0);
 assert.equal(r.observed_official_release_input_count,4);
});
test("public official releases AND observed OSINT contribute independently with provenance weights",async()=>{
 const official=SOURCE[0];
 const osint={...example("macro","00000077","monetary policy"),
  status:"osint_feed_observed_unverified",
  development_type:"unverified OSINT feed observation",geography:null,
  sources_credited:["Monitored feed: research.example"]};
 const r=await certifiedNewsSeverityGriFromSignals([official,osint,
  {...example("rare_earth","00000078","critical-minerals policy"),
   status:"official_feed_candidate_unscored",topic:"minerals publisher candidate",
   development_type:"unclassified publisher update",geography:null}],
  {now:NOW,secret:SECRET});
 assert.equal(r.observed_official_release_input_count,1);
 assert.equal(r.observed_osint_input_count,1);
 assert.equal(r.osint_event_facts_verified,false);
 assert.equal(r.data.candidateEventCount,2);
 assert.equal(r.data.indices[0].status,"available");
 assert.equal(r.data.indices[1].status,"available");
 assert.equal(r.data.indices[1].sourceMix.osint,1);
 assert.equal(r.data.indices[1].sourceMix.public_news,0);
 assert.ok(r.data.indices[1].score>=12&&r.data.indices[1].score<=45);
 assert.ok(r.data.indices[1].confidence<=18);
 assert.equal(r.data.indices[1].independentStoryCount,0);
 assert.equal(r.data.indices[2].status,"unavailable");
 assert.equal(r.data.indices[2].score,null);
});
test("a matching official release takes priority over uncorroborated OSINT in one bucket",async()=>{
 const osint={...SOURCE[0],
  id:"geopolitics-00000099",status:"osint_feed_observed_unverified",
  development_type:"unverified OSINT feed observation",geography:null,
  sources_credited:["Monitored feed: research.example"]};
 const official={...SOURCE[0],geography:null};
 const r=await certifiedNewsSeverityGriFromSignals([osint,official],
  {now:NOW,secret:SECRET});
 assert.equal(r.observed_osint_input_count,1);
 assert.equal(r.data.indices[0].eventCount,1);
 assert.equal(r.data.indices[0].sourceMix.public_news,1);
 assert.equal(r.data.indices[0].sourceMix.osint,0);
 assert.ok(r.data.indices[0].confidence>18);
});
test("public news and OSINT across all three categories are both counted without source URL disclosure",async()=>{
 const osintRows=[
  ["geopolitics","geopolitical security","000000a1"],
  ["macro","monetary policy","000000a2"],
  ["rare_earth","critical-mineral inputs","000000a3"],
 ].map(([category,topic,id])=>({...example(category,id,topic,90),
  status:"osint_feed_observed_unverified",
  development_type:"unverified OSINT feed observation",geography:null,
  sources_credited:["Monitored feed: international.example"]}));
 const r=await certifiedNewsSeverityGriFromSignals([...SOURCE,...osintRows],
  {now:NOW,secret:SECRET});
 assert.equal(r.observed_osint_input_count,3);
 assert.equal(r.observed_official_release_input_count,4);
 assert.deepEqual(r.data.indices.map(x=>x.sourceMix.osint),[1,1,1]);
 assert.deepEqual(r.data.indices.map(x=>x.status),["available","available","available"]);
 assert.ok(r.data.indices.every(x=>x.score!==null&&x.score<=100));
 assert.doesNotMatch(JSON.stringify(r),/international\\.example|raw_upstream|source_url/);
});
test("no qualifying news means unavailable, not synthetic zero/unchanged score",async()=>{
 const r=await certifiedNewsSeverityGriFromSignals([],{now:NOW,secret:SECRET});
 assert.equal(r.data.candidateEventCount,0);
 assert.ok(r.data.indices.every(x=>x.score===null&&
   x.status==="unavailable"&&x.topEvent===null));
});
test("duplicate news does not manufacture corroboration; repeated ID is rejected",async()=>{
 const r=await certifiedNewsSeverityGriFromSignals([
  SOURCE[0],{...SOURCE[0],id:"geopolitics-00000005"},
 ],{now:NOW,secret:SECRET});
 assert.equal(r.data.indices[0].eventCount,1);
 await assert.rejects(certifiedNewsSeverityGriFromSignals([SOURCE[0],SOURCE[0]],
  {now:NOW,secret:SECRET}),/DUPLICATE_INPUT/);
});
test("source failure and absent server-held issuer credential fail closed",async()=>{
 const env={CONTROL_PLANE_TOKEN:SECRET};
 const response=await serveSelfCertifiedNewsSeverityGri(env,{
  now:NOW,source:async()=>Response.json({ok:false},{status:503})});
 assert.equal(response.status,503);
 const absent=await serveSelfCertifiedNewsSeverityGri({},{
  now:NOW,source:async()=>Response.json({
   ok:true,schema:"geomacro.website-derived-news-bundle.v1",complete:true,
   retention_hours:72,returned_rows:SOURCE.length,signals:SOURCE
  })});
 assert.equal(absent.status,503);
});
test("public endpoint returns only self-certified, source-neutral report, no raw providers",async()=>{
 const db=testLastQualifiedDb();
 const out=await serveSelfCertifiedNewsSeverityGri({CONTROL_PLANE_TOKEN:SECRET,DB:db},{
  now:NOW,source:async()=>Response.json({
   ok:true,schema:"geomacro.website-derived-news-bundle.v1",complete:true,
   retention_hours:72,returned_rows:SOURCE.length,signals:SOURCE
  })
 });
 assert.equal(out.status,200);
 assert.equal(out.headers.get("x-geomacro-certification"),
  "geomacro-self-certified-news-severity-v1");
 const body=await out.json();
 assert.equal(body.certification.issuer,"GeoMacro");
 assert.doesNotMatch(JSON.stringify(body),/source_url|articleUrl|raw_upstream|private_key/);
});
test("existing page layout stays but GeoMacro news severity replaces signed GRI parent dependency",()=>{
 const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");
 const hook=readFileSync("src/lib/use-risk-indices.ts","utf8");
 const view=readFileSync("src/components/risk-indices/risk-indices-workspace.tsx","utf8");
 assert.match(worker,/serveSelfCertifiedNewsSeverityGri/u);
 assert.match(worker,/\/v1\/public\/geomacro-certified-news-severity-gri/u);
 assert.match(hook,/const response=await readGeoMacroCertifiedNewsRisk\(\)/u);
 assert.match(view,/GeoMacro Certified GRI/u);
 assert.match(view,/GeoMacro self-certified/u);
 assert.doesNotMatch(view,/independent third-party certification or verification of every reported event is present/u);
});

test("real 24H/48H/72H journal backfill stays source-native and never invents old GRI scores",async()=>{
 const history=[
  example("geopolitics","000000a1","geopolitical security",71*60),
  example("geopolitics","000000a2","foreign policy",43*60),
  example("geopolitics","000000a3","geopolitical security",18*60),
  example("geopolitics","000000a4","foreign policy",3*60),
 ];
 const out=await certifiedNewsSeverityGriFromSignals(history,{now:NOW,secret:SECRET});
 const index=out.data.indices[0];
 assert.deepEqual(Object.keys(index.observedSeverity),["24H","48H","72H"]);
 assert.equal(index.observedSeverity["24H"].buckets.reduce((s,x)=>s+x.count,0),2);
 assert.equal(index.observedSeverity["48H"].buckets.reduce((s,x)=>s+x.count,0),3);
 assert.equal(index.observedSeverity["72H"].buckets.reduce((s,x)=>s+x.count,0),4);
 assert.equal(index.series["7D"].buckets,null);
 assert.equal(index.series["30D"].buckets,null);
 for(const window of ["24H","48H","72H"]){
  const bins=index.observedSeverity[window].buckets;
  assert.ok(bins.length<=13);
  assert.ok(bins.every(b=>b.t%(6*3600000)===0&&b.avg>=0&&b.avg<=100&&b.count>=1));
 }
 const empty=out.data.indices[1].observedSeverity["72H"];
 assert.equal(empty.buckets,null);
 assert.equal(empty.low,null);
 assert.equal(empty.high,null);
 assert.equal(out.data.indices[1].score,null);
});
test("GeoMacro OSINT stays low-weight and historical bins never increase source authority",async()=>{
 const osint={...example("macro","000000b5","monetary policy",50*60),
  status:"osint_feed_observed_unverified",geography:null,development_type:"unverified OSINT feed observation",
  sources_credited:["Monitored feed: research.example"]};
 const out=await certifiedNewsSeverityGriFromSignals([osint],{now:NOW,secret:SECRET});
 const index=out.data.indices[1];
 assert.equal(index.sourceMix.osint,1);
 assert.equal(index.sourceMix.osint_event_facts_verified,false);
 assert.equal(index.observedSeverity["72H"].buckets.reduce((s,b)=>s+b.count,0),1);
 assert.equal(index.observedSeverity["24H"].buckets,null);
 assert.equal(out.independent_third_party_certified,false);
});

function testLastQualifiedDb(){
 const rows=new Map();
 const queries={reads:0,writes:0};
 return {rows,queries,
  prepare(sql){
   let args=[];
   return {
    bind(...next){args=next;return this},
    async all(){
     assert.match(sql,/SELECT category,methodology_version,index_json/u);
     queries.reads++;
     return {results:[...rows.values()].map(x=>({...x}))};
    },
    async run(){
     assert.match(sql,/INSERT INTO geomacro_news_gri_last_verified/u);
     const [category,methodology_version,index_json,index_sha256,
      evidence_sha256,fingerprints_json,expected]=args;
     const old=rows.get(category);
     if(old && old.revision!==expected)return {success:true,meta:{changes:0}};
     if(!old&&expected!==0)return {success:true,meta:{changes:0}};
     rows.set(category,{category,methodology_version,index_json,index_sha256,
      evidence_sha256,fingerprints_json,revision:(old?.revision??0)+1});
     queries.writes++;
     return {success:true,meta:{changes:1}};
    },
   };
  },
 };
}
const NEWS_BUNDLE=signals=>async()=>Response.json({
 ok:true,schema:"geomacro.website-derived-news-bundle.v1",complete:true,
 retention_hours:72,returned_rows:signals.length,signals,
});
const served=async(db,signals,now=NOW)=>{
 const response=await serveSelfCertifiedNewsSeverityGri(
  {CONTROL_PLANE_TOKEN:SECRET,DB:db},{now,source:NEWS_BUNDLE(signals)});
 assert.equal(response.status,200);
 return response.json();
};
test("durable GRI: identical journal does NOT rewrite or recalculate score when five hours pass",async()=>{
 const db=testLastQualifiedDb();
 const original=await served(db,SOURCE,NOW);
 const baseline=original.data.indices.map(x=>x.score);
 const time=NOW+5*3600000;
 const next=await served(db,SOURCE,time);
 assert.deepEqual(next.data.indices.map(x=>x.score),baseline);
 assert.deepEqual(next.data.indices.map(x=>x.readingAsOf),
  original.data.indices.map(x=>x.readingAsOf));
 assert.deepEqual(next.data.indices.map(x=>x.readingSnapshotId),
  original.data.indices.map(x=>x.readingSnapshotId));
 assert.equal(next.data.indices[0].readingStatus,"last_verified");
 assert.deepEqual(next.continuity.retained_categories,
  ["geopolitics","macro","critical_minerals"]);
 assert.deepEqual(next.continuity.updated_categories,[]);
 assert.equal(db.queries.writes,3);
 assert.equal(next.data.proofHash,original.data.proofHash);
});
test("durable GRI: a new real macro signal updates ONLY macro; quiet geopolitics/minerals remain pinned",async()=>{
 const db=testLastQualifiedDb();
 const original=await served(db,SOURCE,NOW);
 const later=NOW+7*60000;
 const extra=example("macro","00abcdef","inflation and prices",2);
 extra.published_at=new Date(later-60000).toISOString();
 const changed=await served(db,[...SOURCE,extra],later);
 assert.deepEqual(changed.continuity.updated_categories,["macro"]);
 assert.deepEqual(changed.continuity.retained_categories,["geopolitics","critical_minerals"]);
 assert.equal(changed.data.indices[0].score,original.data.indices[0].score);
 assert.equal(changed.data.indices[2].score,original.data.indices[2].score);
 assert.equal(changed.data.indices[0].readingAsOf,original.data.indices[0].readingAsOf);
 assert.equal(changed.data.indices[2].readingAsOf,original.data.indices[2].readingAsOf);
 assert.equal(db.queries.writes,4);
 await served(db,[...SOURCE,extra],later+60000);
 assert.equal(db.queries.writes,4,"unchanged source identities must not write D1");
});
test("durable GRI: rolling expiry and empty qualified journal NEVER erase last three signed readings",async()=>{
 const db=testLastQualifiedDb();
 const original=await served(db,SOURCE,NOW);
 const noRows=await served(db,[],NOW+80*3600000);
 assert.equal(db.queries.writes,3);
 assert.deepEqual(noRows.data.indices.map(x=>x.score),
  original.data.indices.map(x=>x.score));
 assert.deepEqual(noRows.data.indices.map(x=>x.readingStatus),
  ["last_verified","last_verified","last_verified"]);
 assert.ok(noRows.data.indices.every(x=>x.observedSeverity["72H"].buckets===null));
 assert.ok(noRows.data.indices.every(x=>x.readingAsOf!==null));
 assert.equal(noRows.data.snapshotAsOf,new Date(NOW+80*3600000).toISOString());
});
test("durable GRI: D1 outage/corruption or missing durable binding FAIL CLOSED, never fabricate success",async()=>{
 const db=testLastQualifiedDb();
 const before=await served(db,SOURCE,NOW);
 assert.equal(before.data.indices[0].status,"available");
 db.rows.get("geopolitics").index_sha256="0".repeat(64);
 let response=await serveSelfCertifiedNewsSeverityGri({
  CONTROL_PLANE_TOKEN:SECRET,DB:db},{now:NOW+60000,source:NEWS_BUNDLE(SOURCE)});
 assert.equal(response.status,503);
 response=await serveSelfCertifiedNewsSeverityGri({
  CONTROL_PLANE_TOKEN:SECRET},{now:NOW,source:NEWS_BUNDLE(SOURCE)});
 assert.equal(response.status,503);
});
test("durable GRI: a genuine source revision triggers update; a failed optimistic write never greenwashes",async()=>{
 const db=testLastQualifiedDb();
 await served(db,SOURCE,NOW);
 const revised=SOURCE.map(x=>x.id==="macro-00000003"?{...x,topic:"inflation and prices"}:x);
 const later=NOW+60000;
 const updated=await served(db,revised,later);
 assert.deepEqual(updated.continuity.updated_categories,["macro"]);
 assert.equal(db.queries.writes,4);
 const broken={prepare(sql){
  const prepared=db.prepare(sql);
  if(sql.startsWith("INSERT"))prepared.run=async()=>({success:true,meta:{changes:0}});
  return prepared;
 }};
 const newest=example("macro","0000badd","official economic statistics",1);
 newest.published_at=new Date(later+60000).toISOString();
 const result=await serveSelfCertifiedNewsSeverityGri({CONTROL_PLANE_TOKEN:SECRET,DB:broken},
  {now:later+120000,source:NEWS_BUNDLE([...revised,newest])});
 assert.equal(result.status,503);
});

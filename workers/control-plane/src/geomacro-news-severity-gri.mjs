/**
 * GeoMacro SELF-CERTIFIED, news-severity methodology v1.
 * Official public news and monitored OSINT are both inputs, with explicitly
 * provenance-weighted potential severity; unverified OSINT is never confirmed event
 * magnitude, externally certified GRI v1.2 or market-probability.
 *
 * No source URLs, raw upstream content, PREDGE, payment or new D1 storage.
 * A domain with no qualified release remains unavailable, NEVER scored zero.
 */
import {readDerivedStoriesBundle,verifyDerivedStory} from "./website-derived-intelligence.mjs";

export const NEWS_GRI_SCHEMA="geomacro.self-certified-news-severity-gri.v1";
export const NEWS_GRI_METHOD="geomacro-news-severity-v1.1.0";
export const NEWS_GRI_WINDOW_MS=72*60*60_000;
const STATUS_OFFICIAL="official_release_observed_unscored";
const STATUS_OSINT="osint_feed_observed_unverified";
const encoder=new TextEncoder();
const DOMAINS=[
 {key:"geopolitics",sourceCategory:"geopolitics",name:"Geopolitical Risk Index"},
 {key:"macro",sourceCategory:"macro",name:"Macroeconomic Risk Index"},
 {key:"critical_minerals",sourceCategory:"rare_earth",name:"Critical Minerals Risk Index"},
];
const rubric={
 geopolitics:{"geopolitical security":84,"sanctions and trade restrictions":76,
  "security and diplomacy":55,"foreign policy":45},
 macro:{"monetary policy":75,"inflation and prices":72,"FX and external balances":68,
  "financial conditions":70,"banking and capital regulation":65,
  "global FX, trade and industrial conditions":66,"official economic statistics":56,
  "energy supply and cost outlook":67,"trade and economic relations":62},
 rare_earth:{"rare-earth supply":82,"critical-mineral processing and supply chains":82,
  "critical-minerals policy":71,"critical-mineral inputs":75,
  "strategic mineral and rare-earth inputs":76,
  "mineral exploration and production":56,
  "resources and energy export outlook":69}
};
const weights={security:6,"trade restriction":7,"trade policy":5,
 "monetary policy":4,"price data":3,production:2};
const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
const hex=a=>Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
async function digest(value){
 return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",
  typeof value==="string"?encoder.encode(value):value)));
}
async function seal(payloadJson,secret){
 if(typeof secret!=="string"||secret.length<32)throw Error("GEOMACRO_NEWS_GRI_ISSUER_NOT_CONFIGURED");
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,
   encoder.encode("GEOMACRO/SELF-CERTIFIED/NEWS-SEVERITY-GRI/v1\\n"+payloadJson))));
}
function qualified(row,now){
 if(!row||!["official_release_observed_unscored","osint_feed_observed_unverified"].includes(row.status)||
    !["geopolitics","macro","rare_earth"].includes(row.category)||
    !verifyDerivedStory(row,now)||row.severity!==null||
    row.same_event_corrob_verified!==false)return false;
 const at=Date.parse(row.published_at);
 return Number.isFinite(at)&&at<=now&&now-at<=NEWS_GRI_WINDOW_MS;
}
function severity(row){
 const base=rubric[row.category]?.[row.topic]??48;
 const extra=weights[String(row.development_type).toLowerCase()]??0;
 // Monitored feed observations do NOT verify that a reported event occurred.
 if(row.status===STATUS_OSINT)return bound(Math.round((base+extra)*0.46),12,42);
 return bound(base+extra,10,95);
}
function blankSeries(frame){return {timeframe:frame,buckets:null,low:null,high:null}}
function series(rows,now,frame){
 const span=frame==="24H"?24*3600000:frame==="7D"?7*86400000:30*86400000;
 // The upstream canonical journal retains only 72h. Do not relabel
 // that 72h slice as complete 7D/30D historical performance.
 if(span>NEWS_GRI_WINDOW_MS)return blankSeries(frame);
 const step=6*3600000,buckets=[];
 for(let t=Math.floor((now-span)/step)*step;t<now;t+=step){
  const group=rows.filter(x=>x.at>=t&&x.at<t+step);
  if(group.length)buckets.push({t,avg:Math.round(
    group.reduce((sum,r)=>sum+r.severity,0)/group.length*10)/10,count:group.length});
 }
 if(buckets.length<2)return blankSeries(frame);
 return {timeframe:frame,buckets,low:Math.min(...buckets.map(b=>b.avg)),
  high:Math.max(...buckets.map(b=>b.avg))};
}
function buildIndex(spec,raw,now){
 const chosen=new Map();
 for(const row of raw){
  if(row.category!==spec.sourceCategory)continue;
  const at=Date.parse(row.published_at);
  // One release per named development, jurisdiction, and six-hour time bin.
  // Never count many syndications as independent source corroboration.
  const dedup=[row.category,row.topic,row.geography??"global",
    Math.floor(at/(6*3600000))].join("|");
  const point={at,severity:severity(row),row};
  const previous=chosen.get(dedup);
  const rank=x=>x.row.status===STATUS_OFFICIAL?2:1;
  // Never displace an official release by an unverified feed observation.
  if(!previous||rank(point)>rank(previous)||
    (rank(point)===rank(previous)&&(point.severity>previous.severity||
      point.severity===previous.severity&&at>previous.at)))
   chosen.set(dedup,point);
 }
 const news=[...chosen.values()].sort((a,b)=>b.at-a.at||
  b.severity-a.severity||a.row.id.localeCompare(b.row.id));
 const latest=news[0];
 const entries=news.map(x=>({...x,weight:
  Math.pow(0.5,(now-x.at)/(18*3600000))*
  (x.row.status===STATUS_OSINT?0.22:1)}));
 const officialEntries=entries.filter(x=>x.row.status===STATUS_OFFICIAL);
 const osintEntries=entries.filter(x=>x.row.status===STATUS_OSINT);
 const total=entries.reduce((s,e)=>s+e.weight,0);
 const weighted=total?entries.reduce((s,e)=>s+e.severity*e.weight,0)/total:0;
 const top=entries.reduce((m,e)=>Math.max(m,e.severity),0);
 const freshness=total?total/(officialEntries.length+osintEntries.length*0.22):0;
 const score=entries.length?bound(Math.round(
  (0.65*top+0.35*weighted)*Math.pow(freshness,0.45)+
  Math.min(8,Math.log2(officialEntries.length+1)*3)+
  Math.min(2,Math.log2(osintEntries.length+1))),0,100):null;
 const credits=new Set(news.flatMap(x=>x.row.sources_credited??[])
  .filter(x=>typeof x==="string"));
 const newestAt=latest?.at??null;
 const readingAt=newestAt===null?null:new Date(newestAt).toISOString();
 const available=score!==null;
 return {
  key:spec.key,name:spec.name,sourceCategory:spec.sourceCategory,
  status:available?"available":"unavailable",
  readingStatus:newestAt!==null&&now-newestAt<=60*60_000?"current":"last_verified",
  readingSnapshotId:available?null:null,readingAsOf:readingAt,
  readingAgeHours:newestAt===null?null:Math.round((now-newestAt)/3600000*100)/100,
  score,rawScore:score,previousScore:null,changePoints:null,
  confidence:available?Math.round(Math.min(55,
    officialEntries.length*2+osintEntries.length+
    entries.reduce((sum,x)=>sum+(x.row.status===STATUS_OFFICIAL?48:10)*x.weight,0)/
    Math.max(0.001,total))):null,
  eventCount:news.length,sourceCount:credits.size,
  independentStoryCount:0, // No independent same-event corroboration exists in this journal.
  sourceMix:{public_news:officialEntries.length,osint:osintEntries.length,
    osint_event_facts_verified:false},
  series:{"24H":series(news,now,"24H"),"7D":blankSeries("7D"),"30D":blankSeries("30D")},
  topEvent:latest?{title:latest.row.title,summary:null,severity:latest.severity}:null,
 };
}
export async function certifiedNewsSeverityGriFromSignals(signals,{
 now=Date.now(),secret
}={}){
 if(!Number.isFinite(now)||!Array.isArray(signals)||signals.length>600)
  throw Error("GEOMACRO_NEWS_GRI_INPUT_INVALID");
 const selected=signals.filter(row=>qualified(row,now));
 if(new Set(selected.map(x=>x.id)).size!==selected.length)
  throw Error("GEOMACRO_NEWS_GRI_DUPLICATE_INPUT");
 const stable=selected.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const inputHash=await digest(JSON.stringify(stable.map(x=>({
  id:x.id,category:x.category,topic:x.topic,geography:x.geography,
  title:x.title,what_changed:x.what_changed,why_it_matters:x.why_it_matters,
  development_type:x.development_type,published_at:x.published_at,
  date_precision:x.date_precision,status:x.status
 }))));
 const methodologyHash=await digest(JSON.stringify({
  version:NEWS_GRI_METHOD,window_hours:72,half_life_hours:18,
  rubric,weights,dedup:"topic-geography-six-hour-prioritize-official",
  osint_severity_factor:0.46,osint_weight:0.22,osint_score_cap:42,
  osint_event_facts_verified:false,
  scope:"observed-official-public-news-and-unverified-osint-no-independent-event-verification"
 }));
 const timestamp=new Date(now).toISOString();
 const indices=DOMAINS.map(spec=>buildIndex(spec,stable,now));
 const calculationHash=await digest(JSON.stringify(indices.map(x=>({
  category:x.key,score:x.score,eventCount:x.eventCount,
  readingAsOf:x.readingAsOf}))));
 const proofHash=await digest("GeoMacroNewsGRI/v1\\n"+inputHash+"\\n"+
   methodologyHash+"\\n"+calculationHash);
 for(const index of indices)if(index.status==="available")index.readingSnapshotId=proofHash;
 const data={
  contractVersion:"risk-indices-v1.1.0",
  parentMethodologyVersion:NEWS_GRI_METHOD,
  proofVersion:NEWS_GRI_SCHEMA,
  proofScope:"geomacro-news-severity",
  snapshotId:proofHash,snapshotAsOf:timestamp,
  verificationStatus:"verified",proofHash,evidenceHash:inputHash,
  calculationHash,dispositionHash:proofHash,inputHash,methodologyHash,
  changeHash:null,candidateEventCount:stable.length,
  reconciliationResidual:null,changeResidual:null,indices
 };
 const signedPayloadJson=JSON.stringify({
  schema:NEWS_GRI_SCHEMA,issuer:"GeoMacro",scope:"GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY",
  independent_third_party_certified:false,
  source_event_facts_independently_verified:false,
  observed_official_release_input_count:stable.filter(x=>x.status===STATUS_OFFICIAL).length,
  observed_osint_input_count:stable.filter(x=>x.status===STATUS_OSINT).length,
  osint_event_facts_verified:false,
  generated_at:timestamp,methodology_version:NEWS_GRI_METHOD,data
 });
 const signature=await seal(signedPayloadJson,secret);
 return {
  ...JSON.parse(signedPayloadJson),
  certification:{
   issuer:"GeoMacro",scheme:"HMAC-SHA256",
   key_scope:"server-held-GeoMacro-only",
   signed_payload_sha256:await digest(signedPayloadJson),
   signature_hex:signature,
   independent_external_audit:false,
  }
 };
}
export async function serveSelfCertifiedNewsSeverityGri(env,{
 now=Date.now(),source=readDerivedStoriesBundle
}={}){
 const bad=code=>Response.json({ok:false,code},{status:503,
  headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
 try{
  const result=await source(env,now,true);
  if(result.status!==200)return bad("QUALIFIED_NEWS_SOURCE_UNAVAILABLE");
  const doc=await result.json();
  if(doc?.ok!==true||doc.schema!=="geomacro.website-derived-news-bundle.v1"||
    doc.complete!==true||doc.retention_hours!==72||
    doc.returned_rows!==doc.signals?.length||
    !Array.isArray(doc.signals)||doc.signals.length>600)
   return bad("QUALIFIED_NEWS_SOURCE_INVALID");
  const report=await certifiedNewsSeverityGriFromSignals(doc.signals,{
   now,secret:env.CONTROL_PLANE_TOKEN});
  return Response.json(report,{status:200,headers:{
   "Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"public, max-age=60, stale-while-revalidate=180",
   "Access-Control-Allow-Origin":"*",
   "Access-Control-Expose-Headers":"X-GeoMacro-Certification,X-GeoMacro-Methodology",
   "X-GeoMacro-Certification":"geomacro-self-certified-news-severity-v1",
   "X-GeoMacro-Methodology":NEWS_GRI_METHOD,
   "X-Content-Type-Options":"nosniff"
  }});
 }catch{return bad("GEOMACRO_NEWS_GRI_UNAVAILABLE")}
}

#!/usr/bin/env bun
/**
 * Recovery of missing FREE Intelligence NEWS from October 2026.
 *
 * Search GOV.UK's PUBLIC first-party Search API for historical candidates
 * (search public_timestamp is NOT assumed to be first-published). For each
 * relevant immutable publisher article path, independently read Content API
 * first_published_at, reject mismatches and original out-of-window dates, and
 * derive only Geomacro's safe news-card vocabulary, never stored article bytes.
 *
 * This does NOT recover signed scored GROs and MUST NOT authorize x402.
 */
import { createHmac } from "node:crypto";
import {
  acceptedOriginalArticleLink,
  deriveStatelessSignals,
  originalPublicationMs,
  selectOfficialTopic,
  type StatelessCategory,
  type StatelessSourceCandidate,
  type StatelessSourceSpec,
} from "../../src/lib/stateless-intelligence-model";
import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";

const DRY_RUN=process.env.BACKFILL_DRY_RUN==="1";
const ROOT=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(!DRY_RUN && ROOT.length<32) throw Error("RECOVERY_CONTROL_PLANE_TOKEN_NOT_CONFIGURED");
const TOKEN=ROOT.length>=32
  ?createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex")
  :"dry-run-only-no-write";
const D1="https://geomacro-control-plane.daspallab202391.workers.dev";
const OGL="Contains public sector information licensed under the Open Government Licence v3.0.";
const TODAY=Date.now();
// Last independent scored releases were Oct 5; start four days earlier to
// avoid omitting releases around the uncertain outage boundary.
const START="2026-10-01";
const START_MS=Date.parse(START+"T00:00:00.000Z");
const END=new Date(TODAY).toISOString().slice(0,10);
const ORGS=Object.freeze([
  ["foreign-commonwealth-development-office","geopolitics","uk_fcdo"],
  ["cabinet-office","geopolitics","uk_cabinet"],
  ["ministry-of-defence","geopolitics","uk_mod"],
  ["home-office","geopolitics","uk_home"],
  ["hm-treasury","macro","uk_treasury"],
  ["department-for-business-innovation-science-and-trade","macro","uk_dbt_macro"],
  ["department-for-energy-security-and-net-zero","rare_earth","uk_energy"],
  ["department-for-business-innovation-science-and-trade","rare_earth","uk_dbt"],
] as const);

type SafeCandidate = {title:string;link:string};
async function safeJson(url: URL,max=384_000): Promise<Record<string,unknown>|null> {
  if(url.protocol!=="https:"||url.hostname!=="www.gov.uk"||
     !(/^\/api\/search\.json$/u.test(url.pathname)||url.pathname.startsWith("/api/content/government/"))) return null;
  const response=await fetch(url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(7_000),
  });
  if(!response.ok || !/^application\/json(?:;|$)/iu.test(response.headers.get("content-type")??""))
    return null;
  if(Number(response.headers.get("content-length")??0)>max)return null;
  const reader=response.body?.getReader();
  if(!reader)return null;
  let size=0;
  const bytes:Uint8Array[]=[];
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>max)return null;
      bytes.push(value);
    }
  }finally{await reader.cancel().catch(()=>undefined);}
  const combined=new Uint8Array(size);
  let offset=0;for(const b of bytes){combined.set(b,offset);offset+=b.length;}
  const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(combined));
  return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:null;
}
const source=(id:string,category:StatelessCategory):StatelessSourceSpec=>({
  id,category,media:"atom",url:"https://www.gov.uk/government/organisations/cabinet-office.atom",
  allowedHosts:["www.gov.uk"],credit:OGL,govContentApi:true,
});
function govPath(link:string):string|null{
  if(!/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]{8,160}$/u.test(link))
    return null;
  return link;
}
async function originalCandidate(candidate:SafeCandidate, spec:StatelessSourceSpec):
  Promise<StatelessSourceCandidate|null> {
  const path=govPath(candidate.link);
  if(!path)return null;
  const article="https://www.gov.uk"+path;
  if(!acceptedOriginalArticleLink(article,spec))return null;
  try{
    const page=await safeJson(new URL("https://www.gov.uk/api/content"+path),160_000);
    if(!page||page.base_path!==path||typeof page.title!=="string"||
       !["news_story","press_release","speech","statement","publication",
         "world_location_news_article"].includes(String(page.document_type)))return null;
    // Search and first-party original must refer to the SAME release, not
    // merely related general subject matter; no translation/URL inference.
    const searchWords=new Set(candidate.title.toLowerCase().match(/[a-z]{5,}/gu)??[]);
    const pageWords=new Set(page.title.toLowerCase().match(/[a-z]{5,}/gu)??[]);
    if([...searchWords].filter(w=>pageWords.has(w)).length<2)return null;
    const at=originalPublicationMs(typeof page.first_published_at==="string"?page.first_published_at:null,TODAY);
    if(at===null||at<START_MS)return null;
    const originalTitle=page.title.trim();
    if(!selectOfficialTopic(originalTitle,spec.category))return null;
    return {sourceId:spec.id,category:spec.category,articleUrl:article,
      title:originalTitle,publishedAt:new Date(at).toISOString(),credit:spec.credit};
  }catch{return null;}
}
async function archivedCandidates(org:string,category:StatelessCategory,id:string){
  const spec=source(id,category);
  const found=new Map<string,SafeCandidate>();
  let searchOk=false;
  for(const start of [0,80]){
    const url=new URL("https://www.gov.uk/api/search.json");
    url.searchParams.set("filter_organisations",org);
    url.searchParams.set("filter_public_timestamp","from:"+START+",to:"+END);
    url.searchParams.set("order","-public_timestamp");
    url.searchParams.set("count","80");
    url.searchParams.set("start",String(start));
    url.searchParams.append("fields","title");
    url.searchParams.append("fields","link");
    try{
      const doc=await safeJson(url,360_000);
      if(!doc||!Array.isArray(doc.results))break;
      searchOk=true;
      for(const row of doc.results){
        if(!row||typeof row.title!=="string"||typeof row.link!=="string")continue;
        if(!selectOfficialTopic(row.title,category))continue;
        if(!govPath(row.link))continue;
        found.set(row.link,{title:row.title,link:row.link});
      }
      if(doc.results.length<80)break;
    }catch{break;}
  }
  // Bounded, gentle first-party Content API corroboration; source-specific
  // search candidates never reach persistent storage or Actions output.
  const foundValues=[...found.values()].slice(0,45);
  const eligible:StatelessSourceCandidate[]=[];
  for(let i=0;i<foundValues.length;i+=5){
    const batch=await Promise.all(foundValues.slice(i,i+5)
      .map(x=>originalCandidate(x,spec)));
    eligible.push(...batch.filter((x):x is StatelessSourceCandidate=>x!==null));
  }
  return {eligible,searchOk,inspected:foundValues.length};
}
async function publish(signals:ReturnType<typeof deriveStatelessSignals>){
  if(DRY_RUN)return;
  for(let i=0;i<signals.length;i+=35){
    const batch=signals.slice(i,i+35);
    const response=await fetch(D1+"/v1/website-derived-news",{
      method:"PUT",redirect:"error",cache:"no-store",
      headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
      body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:batch}),
      signal:AbortSignal.timeout(15_000),
    });
    if(!response.ok)throw Error("HISTORICAL_DERIVED_NEWS_WRITE_REJECTED_"+response.status);
    const reply=await response.json() as {ok?:boolean;accepted?:number};
    if(reply.ok!==true||reply.accepted!==batch.length)throw Error("HISTORICAL_WRITE_ACK_MISMATCH");
  }
}

let sourceOk=0,backfillTotal=0;
const qualified:Record<StatelessCategory,StatelessSourceCandidate[]>={geopolitics:[],macro:[],rare_earth:[]};
for(const [org,category,id] of ORGS){
  const result=await archivedCandidates(org,category,id);
  qualified[category].push(...result.eligible);
  if(result.searchOk)sourceOk++;
  // Logs contain NO provider ID, article titles/URLs, source hosts or raw JSON.
  console.log(JSON.stringify({schema:"geomacro.news-backfill-lane.v1",
    category,search_available:result.searchOk,
    inspected_candidates:result.inspected,original_date_verified:result.eligible.length}));
}
for(const category of ["geopolitics","macro","rare_earth"] as const){
  // Direct current publisher reader ensures same event stable IDs with
  // ongoing feed and keeps non-GOV.UK original releases visible.
  const live=await readStatelessWebsiteIntelligence(category);
  const byId=new Map<string,ReturnType<typeof deriveStatelessSignals>[number]>();
  for(const signal of live.signals)byId.set(signal.id,signal);
  for(const signal of deriveStatelessSignals(qualified[category],TODAY)){
    byId.set(signal.id,signal);
  }
  const rows=[...byId.values()].filter(s=>
    Date.parse(s.published_at)>=START_MS && Date.parse(s.published_at)<=TODAY);
  if(rows.length>0)await publish(rows);
  backfillTotal+=rows.length;
  console.log(JSON.stringify({schema:"geomacro.news-backfill-category.v1",category,
    historical_official_originals:qualified[category].length,
    eligible_derived_total:rows.length,
    original_start_date:START,original_end_date:END,
    missing_originals_not_fabricated:true,supabase_writes:0}));
}
if(DRY_RUN){
  console.log(JSON.stringify({schema:"geomacro.news-gap-first-party-dry-run.v1",
    searched_since:START,through:END,official_search_lanes_available:sourceOk,
    historically_admitted_derived_candidates:backfillTotal,raw_stored:false,
    payment_performed:false,website_delayed_minutes:15}));
  if(sourceOk===0||backfillTotal===0)process.exitCode=2;
} else {
const read=await fetch(D1+"/v1/public/website-derived-news",{
  method:"GET",redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(15_000),
});
if(!read.ok)throw Error("DERIVED_NEWS_BACKFILL_READBACK_UNAVAILABLE");
const body=await read.json() as {
 ok?:boolean;signals?:{id:string;category:string;published_at:string}[];
};
if(body.ok!==true||!Array.isArray(body.signals))throw Error("DERIVED_NEWS_BACKFILL_RECEIPT_INVALID");
const dateBuckets=Object.fromEntries(
  ["geopolitics","macro","rare_earth"].map(category=>[
    category,[...new Set(body.signals!.filter(x=>x.category===category&&
       typeof x.published_at==="string").map(x=>x.published_at.slice(0,10)))].sort(),
  ]));
console.log(JSON.stringify({schema:"geomacro.backfill-independent-d1-readback.v1",
  verified:true,starting_from:START,through:END,official_search_lanes_available:sourceOk,
  historical_candidates_written:backfillTotal,derived_rows_in_d1:body.signals.length,
  verified_original_date_buckets:dateBuckets,
  source_raw_stored:false,backdated_stories:false,
  website_release_delay_minutes:15,supabase_dependency:false}));
if(sourceOk===0||body.signals.length===0)process.exitCode=2;
}

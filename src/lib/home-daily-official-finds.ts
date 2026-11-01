import {isSafeDerivedNewsReadbackSignal} from "../../scripts/lib/derived-news-readback-policy.mjs";
import {isConcretePublicIntelligence,concreteIntelligenceHeadline,concreteGeomacroAnalysis} from "./intelligence-concrete-publication";
import {intelligenceActorChange} from "./public-intelligence-actor-copy";
import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

export const PUBLIC_DAILY_OFFICIAL_FINDS_URL=
  "https://geomacro-public-finds-archive.daspallab202391.workers.dev/daily-highlights.json";
const SCHEMA="geomacro.public-daily-official-finds.v1";
const DAY=86_400_000;
const DOMAINS=["geopolitics","macro","rare_earth"] as const;
const FIELDS=["id","category","title","what_changed","why_it_matters","topic",
 "geography","development_type","published_at","date_precision",
 "observed_release_count","sources_credited","status",
 "same_event_corrob_verified","severity"];
const FIELD_SET=new Set(FIELDS);
const BAD=/\b(?:unverified|source.feed observation|publisher candidate|an official publisher)\b/iu;
const IMPORTANT=/\b(?:sanctions?|ceasefire|war|peace|conflict|security|resolution|election|treaty|trade|embargo|tariffs?|border|shipping|gdp|inflation|rates?|central bank|fomc|federal reserve|employment|currency|exports?|imports?|critical minerals?|rare earths?|lithium|nickel|cobalt|copper|gallium|germanium|supply chain|refining|production|investment|invested|awarded|funding|approved|issued|published|announced|introduced|revised)\b/iu;

export type DailyOfficialFind=Readonly<{
 signal:StatelessIntelligenceSignal;headline:string;whatChanged:string;
 whyItMatters:string;isCurrent:boolean;originalAt:string;
}>;

function verifiedOfficial(s:unknown,now:number):s is StatelessIntelligenceSignal{
 if(!s||typeof s!=="object"||Array.isArray(s))return false;
 const v=s as Record<string,unknown>;
 if(Object.keys(v).length!==FIELD_SET.size||
    Object.keys(v).some(key=>!FIELD_SET.has(key))||
    !isSafeDerivedNewsReadbackSignal(v)||
    v.status!=="official_release_observed_unscored"||
    v.observed_release_count!==1||v.same_event_corrob_verified!==false||
    v.severity!==null||!DOMAINS.includes(v.category as typeof DOMAINS[number])||
    typeof v.published_at!=="string"||
    !["day","exact"].includes(String(v.date_precision))||
    !Array.isArray(v.sources_credited)||v.sources_credited.length>2||
    v.sources_credited.some(c=>typeof c!=="string"||c.length>230||
      /[<>]|https?:\/\/|www\./iu.test(c)))return false;
 const original=v.date_precision==="day"?v.published_at+"T00:00:00.000Z":v.published_at;
 const at=Date.parse(original);
 if(!Number.isFinite(at)||at>now||now-at>30*DAY||
    (v.date_precision==="day"&&
     (new Date(at).toISOString().slice(0,10)!==v.published_at||at+36*3_600_000>now)))return false;
 if(typeof v.title!=="string"||typeof v.what_changed!=="string"||
    BAD.test(v.title+" "+v.what_changed)||!IMPORTANT.test(v.title+" "+v.what_changed)||
    /https?:\/\/|www\.|[<>]/iu.test(JSON.stringify(v)))return false;
 return isConcretePublicIntelligence(v as StatelessIntelligenceSignal);
}

export function parseDailyOfficialFinds(input:unknown,now=Date.now()):StatelessIntelligenceSignal[]{
 if(!input||typeof input!=="object"||Array.isArray(input)||!Number.isFinite(now))
   throw Error("HOME_DAILY_FINDS_DOCUMENT_INVALID");
 const doc=input as Record<string,unknown>;
 if(doc.ok!==true||doc.schema!==SCHEMA||doc.official_only!==true||
    doc.independently_corrob_verified!==false||
    doc.chargeable!==false||doc.scored!==false||
    doc.source_urls_returned!==false||doc.mandatory_source_credits_preserved!==true||
    doc.selection_window_days!==30||
    typeof doc.generated_at!=="string"||
    !Number.isFinite(Date.parse(doc.generated_at))||
    Date.parse(doc.generated_at)>now+60_000||
    !Array.isArray(doc.signals)||doc.signals.length>72||
    JSON.stringify(doc).length>200_000)
   throw Error("HOME_DAILY_FINDS_DOCUMENT_INVALID");
 return doc.signals.filter(s=>verifiedOfficial(s,now));
}
export async function fetchDailyOfficialFinds(fetchImpl:typeof fetch=fetch,now=Date.now()){
 const response=await fetchWithoutRedirectUsing(fetchImpl,PUBLIC_DAILY_OFFICIAL_FINDS_URL,{
   method:"GET",headers:{Accept:"application/json"},credentials:"omit",
   cache:"no-store",signal:AbortSignal.timeout(5_000),
 });
 if(!response.ok||Number(response.headers.get("content-length")??0)>200_000)
   throw Error("HOME_DAILY_FINDS_UNAVAILABLE");
 const raw=await response.text();
 if(raw.length>200_000)throw Error("HOME_DAILY_FINDS_TOO_LARGE");
 return parseDailyOfficialFinds(JSON.parse(raw),now);
}
function short(text:string,max:number){
 const normalized=text.replace(/\s+/gu," ").trim();
 if(normalized.length<=max)return normalized;
 const candidate=normalized.slice(0,max-1);
 const boundary=candidate.lastIndexOf(" ");
 return (boundary>max/2?candidate.slice(0,boundary):candidate).trim()+"…";
}
const priority=(s:StatelessIntelligenceSignal)=>{
 const t=s.title+" "+s.what_changed;
 let score=0;
 if(/\b(?:sanctions?|ceasefire|war|resolution|trade agreement|export ban|tariffs?|fomc|interest rates?|inflation|gdp|lithium|critical minerals?|refining|rare earths?)\b/iu.test(t))score+=4;
 if(/\b(?:approved|announced|introduced|cut|raised|published|revised|invested|awarded|signed)\b/iu.test(t))score+=2;
 return score;
};
/** A new original release replaces older items naturally; a quiet day is
 * explicitly labelled historical, never re-dated or populated with fake news. */
export function selectDailyOfficialFinds(rows:readonly unknown[],now=Date.now(),limit=4):DailyOfficialFind[]{
 if(!Array.isArray(rows)||!Number.isFinite(now))return [];
 const seen=new Set<string>(),all:StatelessIntelligenceSignal[]=[];
 for(const item of rows){
   if(!verifiedOfficial(item,now))continue;
   if(seen.has(item.id))continue;
   seen.add(item.id);all.push(item);
 }
 all.sort((a,b)=>{
   const dayA=Date.parse(a.date_precision==="day"?a.published_at+"T00:00:00Z":a.published_at);
   const dayB=Date.parse(b.date_precision==="day"?b.published_at+"T00:00:00Z":b.published_at);
   const aRecent=dayA>=now-48*3_600_000,bRecent=dayB>=now-48*3_600_000;
   return Number(bRecent)-Number(aRecent)||priority(b)-priority(a)||
     dayB-dayA||a.id.localeCompare(b.id);
 });
 const chosen:StatelessIntelligenceSignal[]=[];
 for(const category of DOMAINS){
   const item=all.find(s=>s.category===category);
   if(item)chosen.push(item);
 }
 // Keep every represented domain and only then add best independent events.
 for(const s of all){
   if(chosen.length>=Math.max(1,Math.min(6,limit)))break;
   if(chosen.some(c=>c.id===s.id))continue;
   const normalized=s.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,"").slice(0,80);
   if(chosen.some(c=>c.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,"").slice(0,80)===normalized))continue;
   chosen.push(s);
 }
 chosen.sort((a,b)=>{
   const ta=Date.parse(a.published_at),tb=Date.parse(b.published_at);
   return tb-ta||a.id.localeCompare(b.id);
 });
 return chosen.slice(0,Math.max(1,Math.min(6,limit))).map(signal=>{
   const originalAt=signal.date_precision==="day"
     ?signal.published_at+"T00:00:00.000Z":signal.published_at;
   return {signal,originalAt,
     isCurrent:Date.parse(originalAt)>=now-24*3_600_000,
     headline:short(concreteIntelligenceHeadline(signal)??"",112),
     whatChanged:short(intelligenceActorChange(signal),184),
     whyItMatters:short(concreteGeomacroAnalysis(signal),225)};
 });
}


/**
 * Separate, explicitly UNVERIFIED homepage lane backed exclusively by
 * the already-public static 72-hour journal. The official-only archive
 * contract stays untouched. No D1 query or source-provider fetch.
 */
export function selectDailyUnverifiedObservations(
 rows:readonly unknown[],now=Date.now(),limit=4
):DailyOfficialFind[]{
 if(!Array.isArray(rows)||!Number.isFinite(now))return [];
 const found:StatelessIntelligenceSignal[]=[],seen=new Set<string>();
 for(const value of rows){
  if(!value||typeof value!=="object"||Array.isArray(value))continue;
  const v=value as StatelessIntelligenceSignal;
  if(v.status!=="osint_feed_observed_unverified"||
     !DOMAINS.includes(v.category)||typeof v.id!=="string"||seen.has(v.id)||
     v.date_precision!=="exact"||
     !isSafeDerivedNewsReadbackSignal(v)||!isConcretePublicIntelligence(v)||
     v.severity!==null||v.same_event_corrob_verified!==false||
     !Array.isArray(v.sources_credited)||v.sources_credited.length!==1||
     !/^Monitored feed: [a-z0-9.-]+(?: \(aggregator; original publisher not verified\))?$/u
       .test(v.sources_credited[0]))continue;
  const ms=Date.parse(v.published_at);
  if(!Number.isFinite(ms)||ms>now||now-ms>72*3_600_000)continue;
  seen.add(v.id);found.push(v);
 }
 found.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
 const chosen:StatelessIntelligenceSignal[]=[];
 for(const category of DOMAINS){
  const row=found.find(x=>x.category===category);
  if(row)chosen.push(row);
 }
 for(const signal of found){
  if(chosen.length>=Math.max(1,Math.min(limit,6)))break;
  if(!chosen.some(v=>v.id===signal.id))chosen.push(signal);
 }
 chosen.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
 return chosen.slice(0,Math.max(1,Math.min(limit,6))).map(signal=>({
  signal,originalAt:signal.published_at,
  isCurrent:Date.parse(signal.published_at)>=now-24*3_600_000,
  headline:short(concreteIntelligenceHeadline(signal)??"",112),
  whatChanged:short(intelligenceActorChange(signal),184),
  whyItMatters:short(concreteGeomacroAnalysis(signal),225)
 }));
}

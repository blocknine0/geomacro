/**
 * Ask Geomacro: use the SAME bounded, previously validated derived D1 journal
 * and score-free signed-GRO teaser projection as Website Intelligence. Do not re-request an issuer original
 * for a category that already has a qualifying <24h source-neutral release.
 * A D1 outage, missing category or unattributed/older row falls back to
 * that category's existing first-party live reader. No paid proof or score.
 */
import {fetchRiskStreamPublicTeasers} from "./public-derived-news-client";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
import type {StatelessCategory} from "./stateless-intelligence-model";

export type SharedAskNewsResult={
 signals:StatelessIntelligenceSignal[];
 journal_categories_reused:StatelessCategory[];
 live_categories_queried:StatelessCategory[];
};
export type SharedAskNewsScope={countryNames?:readonly string[];corridorTerms?:readonly string[]};
type ReadJournal=()=>Promise<StatelessIntelligenceSignal[]>;
type ReadLive=(category:StatelessCategory)=>Promise<{signals:StatelessIntelligenceSignal[]}>;
const ALL=new Set<StatelessCategory>(["geopolitics","macro","rare_earth"]);
const CLOCK_24H=24*60*60_000;
const PUBLIC_GRO_TEASER_FIELDS=new Set(["id","category","title","what_changed",
 "why_it_matters","topic","geography","development_type",
 "published_at","date_precision","observed_release_count","sources_credited",
 "status","same_event_corrob_verified","severity"]);
const PUBLIC_GRO_TEASER_TOPICS=new Set(["foreign policy","monetary policy","rare-earth supply"]);
const PUBLIC_GRO_FORBIDDEN_SOURCE_TEXT=/\b(?:Reuters|Associated Press|AP News|Bloomberg|Financial Times|The Guardian|BBC News|Al Jazeera|CNBC|CNN|The New York Times|New York Times|Wall Street Journal|Nikkei|The Hindu|France-Presse|AFP|publisher|according to|reported by|published by|source(?:d)? by|risk_score_0_100|value_0_100|agent_decision|source_originals|signature_b64)\b|\b(?:risk )?score\s*[:=]\s*\d+\b|(?:https?:\/\/|www\.|[a-z0-9_-]{4,}\.(?:com|org|gov|net)\b)/iu;
function safePublicGroTeaser(s:StatelessIntelligenceSignal,now:number){
 if(!s||typeof s!=="object"||Array.isArray(s))return false;
 const value=s as unknown as Record<string,unknown>;
 return /^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(String(value.id??""))&&
   Object.keys(value).length===PUBLIC_GRO_TEASER_FIELDS.size&&
   Object.keys(value).every(key=>PUBLIC_GRO_TEASER_FIELDS.has(key))&&
   ["geopolitics","macro","rare_earth"].includes(String(value.category))&&
   typeof value.geography==="string"&&value.geography.length>0&&value.geography.length<=70&&
   value.status==="official_release_observed_unscored"&&
   value.sources_credited instanceof Array&&value.sources_credited.length===0&&
   value.same_event_corrob_verified===false&&value.severity===null&&
   value.observed_release_count===1&&value.date_precision==="exact"&&
   typeof value.title==="string"&&value.title.startsWith("Geomacro finds ")&&
   value.title.length>=24&&value.title.length<=240&&
   typeof value.what_changed==="string"&&value.what_changed.length>=25&&value.what_changed.length<=650&&
   typeof value.why_it_matters==="string"&&value.why_it_matters.length>=25&&value.why_it_matters.length<=700&&
   typeof value.topic==="string"&&PUBLIC_GRO_TEASER_TOPICS.has(value.topic)&&
   value.development_type==="official update"&&verifyDerivedStory(s,now)&&
   !PUBLIC_GRO_FORBIDDEN_SOURCE_TEXT.test(JSON.stringify(value));
}
function eligible(s:StatelessIntelligenceSignal,now:number){
 const issued=Date.parse(s?.published_at??"");
 const groTeaser=safePublicGroTeaser(s,now);
 // A dated but unclassified issuer-feed candidate belongs in the free
 // research journal, never the Ask "official news" response tier.
 return s.status==="official_release_observed_unscored"&&
   (groTeaser||verifyDerivedStory(s,now))&&s.sources_credited.length===0&&
   Number.isFinite(issued)&&now-issued>=0&&now-issued<=CLOCK_24H;
}
function normalizedText(value:string):string{
 return value.normalize("NFKC").toLocaleLowerCase().replace(/[‐‑‒–—]/gu,"-")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim();
}
function containsPhrase(text:string,phrase:string):boolean{
 const source=normalizedText(text),needle=normalizedText(phrase);
 return Boolean(needle)&&(` ${source} `).includes(` ${needle} `);
}
function matchesScope(s:StatelessIntelligenceSignal,scope?:SharedAskNewsScope):boolean{
 if(!scope)return true;
 const text=[s.geography??"",s.title,s.what_changed,s.why_it_matters].join(" ");
 const hasCountry=Boolean(scope.countryNames?.length);
 const hasCorridor=Boolean(scope.corridorTerms?.length);
 if(!hasCountry&&!hasCorridor)return true;
 const countryMatch=hasCountry&&scope.countryNames!.some(name=>containsPhrase(text,name));
 const corridorMatch=hasCorridor&&scope.corridorTerms!.some(name=>containsPhrase(text,name));
 return (hasCountry&&countryMatch)||(hasCorridor&&corridorMatch);
}
const defaultLive:ReadLive=async(category)=>{
 const m=await import("./stateless-public-intelligence.server");
 return m.readStatelessWebsiteIntelligence(category);
};
const defaultJournal:ReadJournal=async()=>{
 // The public-teasers endpoint is the canonical, source-redacted D1 view for
 // Ask. One read avoids duplicating the website-derived-news D1 projection.
 return fetchRiskStreamPublicTeasers();
};
export async function collectSharedOfficialNews(
 categories:readonly StatelessCategory[],
  {now=Date.now(),readJournal=defaultJournal,readLive=defaultLive,scope,allowLiveFallback=true}:{
  now?:number;readJournal?:ReadJournal;readLive?:ReadLive;scope?:SharedAskNewsScope;
  allowLiveFallback?:boolean;
 }={},
):Promise<SharedAskNewsResult>{
 if(!Number.isFinite(now)||!Array.isArray(categories)||categories.length<1||
    categories.length>3||new Set(categories).size!==categories.length||
    categories.some(c=>!ALL.has(c)))throw Error("ASK_SHARED_JOURNAL_CATEGORIES_INVALID");
 let rows:StatelessIntelligenceSignal[]=[];
 try{
   const candidate=await readJournal();
   if(!Array.isArray(candidate)||candidate.length>720)
     throw Error("ASK_SHARED_JOURNAL_CONTRACT_INVALID");
   rows=candidate.filter(r=>eligible(r,now)&&matchesScope(r,scope));
 }catch{rows=[]}
 const journal_categories_reused:StatelessCategory[]=[];
 const missing:StatelessCategory[]=[];
 const signals:StatelessIntelligenceSignal[]=[];
 for(const category of categories){
   const group=rows.filter(s=>s.category===category).sort((a,b)=>
     b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
   if(group.length){
     const groTeasers=group.filter(s=>safePublicGroTeaser(s,now));
     signals.push(...groTeasers);
     const ordinary=group.filter(s=>!safePublicGroTeaser(s,now));
     signals.push(...ordinary.slice(0,categories.length===1?3:1));
     journal_categories_reused.push(category);
   }else if(allowLiveFallback)missing.push(category);
 }
 const live=await Promise.allSettled(missing.map(c=>readLive(c)));
 for(let i=0;i<live.length;i++){
   const outcome=live[i];
   if(outcome.status!=="fulfilled")continue;
   const records=outcome.value?.signals;
   if(!Array.isArray(records))continue;
   const category=missing[i];
   const checked=records.filter(s=>s.category===category&&eligible(s,now)&&matchesScope(s,scope))
     .sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
   signals.push(...checked.slice(0,categories.length===1?3:1));
 }
 const seen=new Set<string>();
 const unique=signals.filter(s=>{if(seen.has(s.id))return false;seen.add(s.id);return true});
 return {signals:unique,journal_categories_reused,live_categories_queried:missing};
}

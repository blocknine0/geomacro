/**
 * Ask Geomacro: use the SAME bounded, previously validated derived D1 journal
 * as the website and machine free API. Do not re-request an issuer original
 * for a category that already has a qualifying <24h source-neutral release.
 * A D1 outage, missing category or unattributed/older row falls back to
 * that category's existing first-party live reader. No paid proof or score.
 */
import {fetchAllDerivedNews} from "./public-derived-news-client";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
import type {StatelessCategory} from "./stateless-intelligence-model";

export type SharedAskNewsResult={
 signals:StatelessIntelligenceSignal[];
 journal_categories_reused:StatelessCategory[];
 live_categories_queried:StatelessCategory[];
};
type ReadJournal=()=>Promise<StatelessIntelligenceSignal[]>;
type ReadLive=(category:StatelessCategory)=>Promise<{signals:StatelessIntelligenceSignal[]}>;
const ALL=new Set<StatelessCategory>(["geopolitics","macro","rare_earth"]);
const CLOCK_24H=24*60*60_000;
function eligible(s:StatelessIntelligenceSignal,now:number){
 const issued=Date.parse(s?.published_at??"");
 return verifyDerivedStory(s,now)&&s.sources_credited.length===0&&
   Number.isFinite(issued)&&now-issued>=15*60_000&&now-issued<=CLOCK_24H;
}
const defaultLive:ReadLive=async(category)=>{
 const m=await import("./stateless-public-intelligence.server");
 return m.readStatelessWebsiteIntelligence(category);
};
const defaultJournal:ReadJournal=()=>fetchAllDerivedNews();
export async function collectSharedOfficialNews(
 categories:readonly StatelessCategory[],
 {now=Date.now(),readJournal=defaultJournal,readLive=defaultLive}:{
  now?:number;readJournal?:ReadJournal;readLive?:ReadLive;
 }={},
):Promise<SharedAskNewsResult>{
 if(!Number.isFinite(now)||!Array.isArray(categories)||categories.length<1||
    categories.length>3||new Set(categories).size!==categories.length||
    categories.some(c=>!ALL.has(c)))throw Error("ASK_SHARED_JOURNAL_CATEGORIES_INVALID");
 let rows:StatelessIntelligenceSignal[]=[];
 try{
   const candidate=await readJournal();
   if(!Array.isArray(candidate)||candidate.length>600)
     throw Error("ASK_SHARED_JOURNAL_CONTRACT_INVALID");
   rows=candidate.filter(r=>eligible(r,now));
 }catch{rows=[]}
 const journal_categories_reused:StatelessCategory[]=[];
 const missing:StatelessCategory[]=[];
 const signals:StatelessIntelligenceSignal[]=[];
 for(const category of categories){
   const group=rows.filter(s=>s.category===category).sort((a,b)=>
     b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
   if(group.length){
     signals.push(...group.slice(0,categories.length===1?3:1));
     journal_categories_reused.push(category);
   }else missing.push(category);
 }
 const live=await Promise.allSettled(missing.map(c=>readLive(c)));
 for(let i=0;i<live.length;i++){
   const outcome=live[i];
   if(outcome.status!=="fulfilled")continue;
   const records=outcome.value?.signals;
   if(!Array.isArray(records))continue;
   const category=missing[i];
   const checked=records.filter(s=>s.category===category&&eligible(s,now))
     .sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
   signals.push(...checked.slice(0,categories.length===1?3:1));
 }
 const seen=new Set<string>();
 const unique=signals.filter(s=>{if(seen.has(s.id))return false;seen.add(s.id);return true});
 return {signals:unique,journal_categories_reused,live_categories_queried:missing};
}

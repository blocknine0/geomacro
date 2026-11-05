import {createHash} from "node:crypto";
import {freshnessMaxAgeHours} from "./ask-freshness";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";

/**
 * Zero-write, per-warm-runtime cache for PUBLIC, already-governed Ask results.
 * Never caches raw evidence, model requests, private conversations, scores,
 * ambiguous or personal questions. No D1/B2/Supabase/KV writes.
 *
 * Not a durable multi-instance cache. Short TTL and UTC-date clamping prevent
 * an answer from masquerading as new current intelligence after a refresh.
 */
type CacheEntry<T>={value:T;expiresAt:number};
export type AskModelCacheStatus="hit"|"miss"|"coalesced"|"bypassed";
const CACHE_MAX=192;
const PENDING_MAX=48;
const answers=new Map<string,CacheEntry<HybridAskAnswer>>();
const pending=new Map<string,Promise<HybridAskAnswer>>();
const modelAnswers=new Map<string,CacheEntry<HybridAskAnswer>>();
const modelPending=new Map<string,Promise<HybridAskAnswer>>();

const PERSONAL=/\b(?:i|me|my|mine|we|us|our|ours|account|password|secret|token|api key|private key|my chat|previous chat|earlier conversation|profile|personal|passport|bank account|wallet address|email address)\b/iu;
const NUMERIC_ID=/\b\d{8,}\b/u;
const URL_OR_ADDRESS=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu;
function safeSharedQuestion(question:string):boolean{
 const q=question.trim();
 return q.length>=2&&q.length<=500&&!PERSONAL.test(q)&&
   !URL_OR_ADDRESS.test(q)&&!NUMERIC_ID.test(q)&&
   !/[\0\r\n<>]/u.test(q);
}
function key(domain:string,text:string):string{
 return createHash("sha256").update("geomacro-ask-cache-v1\0").update(domain)
  .update("\0").update(text).digest("hex");
}
function normalized(question:string):string{
 return question.trim().replace(/\s+/gu," ").toLocaleLowerCase("en");
}
function clone<T>(value:T):T{return structuredClone(value)}
function tillNextUtcDay(now:number):number{
 const d=new Date(now);
 return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)-now;
}
export function askAnswerTtlMs(question:string,answer:HybridAskAnswer,now=Date.now()):number{
 if(!safeSharedQuestion(question)||!Number.isFinite(now)||answer.insufficient_evidence||
   answer.low_confidence||answer.gri!==null||(answer as {signed_gro_generated?:boolean}).signed_gro_generated===true||
   /(?:^|\b)(?:risk indices?|gri|signed gro|live score|risk gate|forecast)\b/iu.test(question))
  return 0;
 // Cached content must still be the EXACT canonical public-shaped result.
 if(answer.source_identity_exposed!==false||
    !Array.isArray(answer.evidence)||answer.evidence.length>5||
    answer.durable_live_storage_write!==false)return 0;
 const fresh=freshnessMaxAgeHours(question);
 const ttl=answer.answer_kind==="explainer"&&fresh===null?30*60_000:
   fresh!==null?15_000:45_000;
 return fresh===null?ttl:Math.min(ttl,Math.max(0,tillNextUtcDay(now)));
}
export function askModelTtlMs(question:string,answer:HybridAskAnswer,now=Date.now()):number{
 const core=askAnswerTtlMs(question,answer,now);
 return core?Math.min(core,answer.answer_kind==="explainer"?30*60_000:45_000):0;
}
function get<T>(map:Map<string,CacheEntry<T>>,fingerprint:string,now:number):T|null{
 const hit=map.get(fingerprint);
 if(!hit)return null;
 if(hit.expiresAt<=now){map.delete(fingerprint);return null;}
 map.delete(fingerprint);map.set(fingerprint,hit);
 return clone(hit.value);
}
function save<T>(map:Map<string,CacheEntry<T>>,fingerprint:string,value:T,
 ttlMs:number,now:number){
 if(ttlMs<=0)return;
 map.delete(fingerprint);
 map.set(fingerprint,{value:clone(value),expiresAt:now+ttlMs});
 // Lazily evict expired entries; LRU keeps memory bounded.
 for(const [id,entry] of map)if(entry.expiresAt<=now)map.delete(id);
 while(map.size>CACHE_MAX)map.delete(map.keys().next().value!);
}
function shared<T extends HybridAskAnswer>(
  cache:Map<string,CacheEntry<HybridAskAnswer>>,
  flights:Map<string,Promise<HybridAskAnswer>>,
  fingerprint:string,
  compute:()=>Promise<T>,
  ttl:(answer:T)=>number,
 onStatus?:(status:AskModelCacheStatus)=>void,
):Promise<T>{
 const now=Date.now();
 const hit=get(cache,fingerprint,now);
 if(hit){onStatus?.("hit");return Promise.resolve(hit as T);}
 const existing=flights.get(fingerprint);
 if(existing){onStatus?.("coalesced");return existing.then(clone) as Promise<T>;}
 if(flights.size>=PENDING_MAX){onStatus?.("bypassed");return compute();}
 onStatus?.("miss");
 let job!:Promise<HybridAskAnswer>;
 job=(async()=>{
   try{
     const result=await compute();
     const lifetime=ttl(result);
     if(lifetime>0)save(cache,fingerprint,result,lifetime,Date.now());
     return result;
   }finally{if(flights.get(fingerprint)===job)flights.delete(fingerprint);}
 })();
 flights.set(fingerprint,job);
 return job.then(clone) as Promise<T>;
}

/** Rate limiting and input validation MUST run before this function.
 * The compute closure owns expensive original-discovery quota on a MISS. */
export function cachedCanonicalAsk<T extends HybridAskAnswer>(
 question:string,compute:()=>Promise<T>,
):Promise<T>{
 if(!safeSharedQuestion(question))return compute();
 return shared(answers,pending,key("canonical-v1",normalized(question)),
  compute,(answer)=>askAnswerTtlMs(question,answer));
}

/** Provider output is a restyling of the *same* approved answer, never an
 * independently verified new event. Key includes evidence/answer revision,
 * language (as reflected in question/summary), and backend model version. */
export function cachedGroqAnswer<T extends HybridAskAnswer>(
 question:string,canonical:T,compute:()=>Promise<T>,
 onStatus?:(status:AskModelCacheStatus)=>void,
):Promise<T>{
 if(!safeSharedQuestion(question)||!askModelTtlMs(question,canonical)){
   onStatus?.("bypassed");return compute();
 }
 const revision=JSON.stringify({
   question:normalized(question),summary:canonical.summary,
   what_changed:canonical.what_changed,why_it_matters:canonical.why_it_matters,
   geomacro_view:canonical.geomacro_view,generated_at:canonical.generatedAt,
   evidence:canonical.evidence,kind:canonical.answer_kind,
 });
 return shared(modelAnswers,modelPending,key("groq-gpt-oss-20b-v1",revision),
  compute,(answer)=>answer===canonical?0:askModelTtlMs(question,canonical),onStatus);
}

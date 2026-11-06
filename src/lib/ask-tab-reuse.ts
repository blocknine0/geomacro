import type {AskAnswer} from "./ask-geomacro.functions";

/**
 * Tab-only repeat reuse for timeless, public, evidence-safe explainers.
 * No localStorage/sessionStorage/IndexedDB, cookies or cross-user cache.
 * This avoids another Groq request from the SAME TAB on identical standalone
 * repeat queries, regardless of which SSR instance a later request would hit.
 */
const MAX=48;
const TTL_MS=30*60_000;
const UNSAFE_QUESTION=/\b(?:i|me|my|mine|we|us|our|ours|account|password|secret|token|api key|private|personal|email|passport|wallet|bank account)\b|https?:\/\/|www\.|@|[<>]/iu;
const NON_TIMELESS=/\b(?:today|latest|current|now|this (?:week|month|year)|yesterday|breaking|news|recent|forecast|predict|price|how much|how many|rate today|risk gate|gri|signed gro)\b/iu;
type Entry={answer:AskAnswer;expiresAt:number};

function normalized(question:string):string{
 return question.trim().replace(/\s+/gu," ").toLocaleLowerCase("en");
}
function eligibleQuestion(question:string):boolean{
 const q=question.trim();
 return q.length>=2&&q.length<=500&&!UNSAFE_QUESTION.test(q)&&
  !NON_TIMELESS.test(q)&&!/[\r\n\u0000]/u.test(q);
}
function eligibleAnswer(answer:AskAnswer):boolean{
 return answer.answer_kind==="explainer"&&answer.insufficient_evidence===false&&
  answer.low_confidence===false&&answer.gri===null&&
  answer.source_identity_exposed===false&&
  answer.durable_live_storage_write===false&&Array.isArray(answer.evidence)&&
  answer.evidence.length===0&&
  [answer.summary,answer.what_changed,answer.why_it_matters,answer.geomacro_view]
    .every(s=>typeof s==="string"&&s.trim().length>0);
}
export function createAskTabReuse(){
 const entries=new Map<string,Entry>();
 return {
   get(question:string,hasContext:boolean,now=Date.now()):AskAnswer|null{
     if(hasContext||!eligibleQuestion(question))return null;
     const key=normalized(question),entry=entries.get(key);
     if(!entry)return null;
     if(entry.expiresAt<=now){entries.delete(key);return null;}
     entries.delete(key);entries.set(key,entry);
     return {...structuredClone(entry.answer),cache_status:"hit"};
   },
   remember(question:string,hasContext:boolean,answer:AskAnswer,now=Date.now()):void{
     if(hasContext||!eligibleQuestion(question)||!eligibleAnswer(answer))return;
     const key=normalized(question);
     entries.delete(key);
     entries.set(key,{answer:structuredClone(answer),expiresAt:now+TTL_MS});
     for(const [k,v] of entries)if(v.expiresAt<=now)entries.delete(k);
     while(entries.size>MAX)entries.delete(entries.keys().next().value!);
   },
   clear():void{entries.clear();},
 };
}

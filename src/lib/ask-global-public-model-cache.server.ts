import {createHash,createHmac} from "node:crypto";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
import {safeGroundedOpenAIOutput} from "./ask-openai-grounded.server";
import {freshnessMaxAgeHours} from "./ask-freshness";

/**
 * Optional cross-instance cache over the existing private D1 control-plane.
 * Only immutable general explainers are allowed. No questions, identifiers,
 * contexts, URLs, publishers, evidence, GRO, scores or raw provider output are
 * ever sent to the cache service. The key is a SHA-256 digest of approved
 * public content and the normalized question, not a reversible record.
 */
const URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/ask/public-model-cache";
const FIELDS=["summary","what_changed","why_it_matters","geomacro_view"] as const;
type PublicFields=Pick<HybridAskAnswer,(typeof FIELDS)[number]>;
const MAX_REMOTE_MS=650;
const TTL_SECONDS=30*60;
const PERSONAL=/\b(?:i|me|my|mine|we|us|our|ours|account|password|secret|token|api key|private key|personal|profile|passport|wallet|bank account|email address)\b/iu;
const NOT_TIMELESS=/\b(?:today|now|latest|current|yesterday|news|newest|this (?:week|month|year)|predict|forecast|price|risk indices?|signed gro|risk gate)\b/iu;
const UNSAFE=/(?:https?:\/\/|www\.|@|[<>\r\n\u0000])/u;
function authToken():string|null{
 const key=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 return key.length>=32?createHmac("sha256",key)
   .update("geomacro-control-plane-v1").digest("hex"):null;
}
function eligible(question:string,canonical:HybridAskAnswer):boolean{
 const q=question.trim();
 if(q.length<2||q.length>500||PERSONAL.test(q)||NOT_TIMELESS.test(q)||
    UNSAFE.test(q)||freshnessMaxAgeHours(q)!==null)return false;
 return canonical.answer_kind==="explainer"&&
   canonical.insufficient_evidence===false&&canonical.low_confidence===false&&
   canonical.gri===null&&canonical.source_identity_exposed===false&&
   canonical.durable_live_storage_write===false&&
   Array.isArray(canonical.evidence)&&canonical.evidence.length===0&&
   FIELDS.every(k=>typeof canonical[k]==="string"&&canonical[k].trim().length>0);
}
export function globalAskCacheKey(question:string,canonical:HybridAskAnswer):string|null{
 if(!eligible(question,canonical))return null;
 // Exclude generatedAt: evergreen canonical text is semantically stable,
 // while per-request timestamps vary across serverless runtime instances.
 const revision={model:"groq-gpt-oss-20b-safe-paraphrase-v3",
   question:question.trim().replace(/\s+/gu," ").toLocaleLowerCase("en"),
   fields:Object.fromEntries(FIELDS.map(k=>[k,canonical[k]]))};
 return createHash("sha256").update(JSON.stringify(revision),"utf8").digest("hex");
}
function parsedFields(value:unknown):PublicFields|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join("|")!==[...FIELDS].sort().join("|"))return null;
 if(!FIELDS.every(k=>typeof v[k]==="string"))return null;
 return v as PublicFields;
}
export async function readGlobalAskModelCache(
 question:string,canonical:HybridAskAnswer,fetchImpl:typeof fetch=fetch,
):Promise<HybridAskAnswer|null>{
 const key=globalAskCacheKey(question,canonical),token=authToken();
 if(!key||!token)return null;
 try{
   const response=await fetchImpl(URL+"?key="+key,{
     headers:{Accept:"application/json",Authorization:"Bearer "+token},
     method:"GET",redirect:"manual",signal:AbortSignal.timeout(MAX_REMOTE_MS),
   });
   if(!response.ok)return null;
   const raw=await response.text();
   if(raw.length>2400)return null;
   const envelope=JSON.parse(raw) as {ok?:boolean;hit?:boolean;fields?:unknown};
   if(envelope.ok!==true||envelope.hit!==true)return null;
   const fields=parsedFields(envelope.fields);
   if(!fields)return null;
   // Recheck every unchanged original gate AGAINST CURRENT canonical text.
   const safe=safeGroundedOpenAIOutput(JSON.stringify(fields),canonical,question);
   if(!safe||FIELDS.every(k=>safe[k].trim()===canonical[k].trim()))return null;
   return {...safe,model_rendering:"assisted",model_render_cache:"hit",
     model_render_cache_scope:"distributed"};
 }catch{return null;}
}
export async function writeGlobalAskModelCache(
 question:string,canonical:HybridAskAnswer,formatted:HybridAskAnswer,
 fetchImpl:typeof fetch=fetch,
):Promise<boolean>{
 const key=globalAskCacheKey(question,canonical),token=authToken();
 if(!key||!token||formatted.model_rendering!=="assisted")return false;
 const fields=Object.fromEntries(FIELDS.map(k=>[k,formatted[k]]));
 if(!safeGroundedOpenAIOutput(JSON.stringify(fields),canonical,question)||
   FIELDS.every(k=>formatted[k].trim()===canonical[k].trim()))return false;
 try{
   const response=await fetchImpl(URL,{
     method:"PUT",redirect:"manual",
     headers:{Accept:"application/json","Content-Type":"application/json",
       Authorization:"Bearer "+token},
     body:JSON.stringify({key,fields,expires_at:Math.floor(Date.now()/1000)+TTL_SECONDS}),
     signal:AbortSignal.timeout(MAX_REMOTE_MS),
   });
   if(!response.ok)return false;
   const raw=await response.text();
   if(raw.length>512)return false;
   const status=JSON.parse(raw) as {ok?:boolean};
   return status.ok===true;
 }catch{return false;}
}

#!/usr/bin/env node
/**
 * External production-only, no-funds proof of the optional Free Ask formatter.
 * The returned generic markers attest a validated provider completion and
 * warm-instance cache reuse; they do NOT imply a distributed cache or new facts.
 * No API credential, publisher data, answer body or user identifier is logged.
 */
const DEFAULT_ORIGIN="https://geomacro.live";
const CASES=Object.freeze([
  {name:"geopolitics",question:"Explain geopolitical risk"},
  {name:"macro",question:"What is inflation?"},
  {name:"critical_minerals",question:"What are rare earths?"},
]);
function assertOrigin(input){
 const origin=new URL(input).origin;
 if(origin!==DEFAULT_ORIGIN)throw Error("ASK_FREE_GROQ_ORIGIN_NOT_PRODUCTION");
 return origin;
}
export async function readAsk(origin,question,fetchImpl=fetch){
 const response=await fetchImpl(origin+"/api/ask/v2/turn",{
   method:"POST",headers:{Origin:origin,Accept:"text/event-stream","Content-Type":"application/json"},
   body:JSON.stringify({question,history:[]}),cache:"no-store",
   signal:AbortSignal.timeout(25_000),
 });
 if(response.status!==200||!response.headers.get("content-type")?.startsWith("text/event-stream"))
   throw Error("ASK_FREE_GROQ_STREAM_NOT_200");
 const body=await response.text();
 if(body.length>100_000)throw Error("ASK_FREE_GROQ_STREAM_TOO_LARGE");
 const events=body.replace(/\r\n/g,"\n").split("\n\n");
 const frame=events.filter(x=>x.startsWith("event: answer\n"));
 if(frame.length!==1)throw Error("ASK_FREE_GROQ_ONE_FINAL_REQUIRED");
 const raw=frame[0].split("\n").find(x=>x.startsWith("data: "));
 if(!raw)throw Error("ASK_FREE_GROQ_MISSING_DATA");
 const packet=JSON.parse(raw.slice(6));
 if(packet.ok!==true||!packet.data||typeof packet.data.summary!=="string")
   throw Error("ASK_FREE_GROQ_INVALID_PACKET");
 const a=packet.data;
 if(a.answer_kind!=="explainer"||a.insufficient_evidence!==false||a.low_confidence!==false||
    a.gri!==null||a.source_identity_exposed!==false||a.durable_live_storage_write!==false||
    !Array.isArray(a.evidence)||a.evidence.length!==0)
   throw Error("ASK_FREE_GROQ_UNSAFE_OR_INELIGIBLE_ANSWER");
 return {rendering:a.model_rendering??"unavailable",
   cache:a.model_render_cache??"unavailable",answer_kind:a.answer_kind};
}
export async function verifyLiveAskFreeGroq(origin=DEFAULT_ORIGIN,fetchImpl=fetch){
 const base=assertOrigin(origin);
 const results=[];
 for(const test of CASES){
   const a=await readAsk(base,test.question,fetchImpl);
   results.push({domain:test.name,rendering:a.rendering,cache:a.cache});
   if(a.rendering!=="assisted")throw Error("ASK_FREE_GROQ_GENERATION_UNVERIFIED_"+test.name.toUpperCase());
 }
 // An immediately repeated eligible question must produce a genuine cache
 // readback in a warm instance. A different backend instance can miss; report
 // the result rather than pretend memory caching is globally shared.
 const repeat=await readAsk(base,CASES[0].question,fetchImpl);
 if(repeat.rendering!=="assisted")throw Error("ASK_FREE_GROQ_REPEATED_RENDERING_UNVERIFIED");
 return {schema:"geomacro.ask-free-groq-live-proof.v1",origin:base,
   model_generation_domains:results.length,rendering_accepted:true,
   repeated_question_cache_status:repeat.cache,
   same_runtime_cache_hit_observed:repeat.cache==="hit",
   distributed_cache_proven:false,results,no_funds:true};
}
if(import.meta.url===new URL("file://"+process.argv[1]).href){
 verifyLiveAskFreeGroq(process.env.GEOMACRO_BASE_URL).then(x=>{
   console.log(JSON.stringify(x));
   if(!x.same_runtime_cache_hit_observed)process.exitCode=2;
 }).catch(e=>{console.error(e.message);process.exitCode=1});
}

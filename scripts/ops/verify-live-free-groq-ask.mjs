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
export async function readPublishedBuild(origin,fetchImpl=fetch){
 try{
   const res=await fetchImpl(origin+"/.well-known/geomacro-build.json",{
     method:"GET",headers:{Accept:"application/json","Cache-Control":"no-store"},
     redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10_000)});
   if(res.status!==200)return {sha:null,status:"HTTP_"+res.status};
   const raw=await res.text();
   if(raw.length>8192)return {sha:null,status:"OVERSIZE"};
   const data=JSON.parse(raw);
   const sha=typeof data?.canonical_main_sha==="string"&&/^[0-9a-f]{40}$/u.test(data.canonical_main_sha)&&
     data.canonical_repository==="blocknine0/geomacro"?data.canonical_main_sha:null;
   return {sha,status:sha?"VALID":"INVALID"};
 }catch{return {sha:null,status:"UNAVAILABLE"};}
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
 const build=await readPublishedBuild(base,fetchImpl);
 const expected=process.env.EXPECTED_CANONICAL_MAIN_SHA??null;
 console.log(JSON.stringify({stage:"published_build",status:build.status,
   sha:build.sha?.slice(0,12)??null,expected:expected?.slice(0,12)??null}));
 const results=[];
 for(const test of CASES){
   const a=await readAsk(base,test.question,fetchImpl);
   results.push({domain:test.name,rendering:a.rendering,cache:a.cache});
   console.log(JSON.stringify({stage:"model_probe",domain:test.name,rendering:a.rendering,cache:a.cache}));
   if(a.rendering!=="assisted")throw Error("ASK_FREE_GROQ_GENERATION_UNVERIFIED_"+test.name.toUpperCase());
 }
 // An immediately repeated eligible question must produce a genuine cache
 // readback in a warm instance. A different backend instance can miss; report
 // the result rather than pretend memory caching is globally shared.
 const repeat=await readAsk(base,CASES[0].question,fetchImpl);
 console.log(JSON.stringify({stage:"repeat_probe",rendering:repeat.rendering,cache:repeat.cache}));
 if(repeat.rendering!=="assisted")throw Error("ASK_FREE_GROQ_REPEATED_RENDERING_UNVERIFIED");
 if(expected&&build.sha!==expected)throw Error("ASK_PUBLISHED_SHA_UNVERIFIED");
 return {schema:"geomacro.ask-free-groq-live-proof.v1",origin:base,
   model_generation_domains:results.length,rendering_accepted:true,
   repeated_question_cache_status:repeat.cache,
   same_runtime_cache_hit_observed:repeat.cache==="hit",
   distributed_cache_proven:false,published_sha_checked:expected!==null&&build.sha===expected,
   results,no_funds:true};
}
if(import.meta.url===new URL("file://"+process.argv[1]).href){
 verifyLiveAskFreeGroq(process.env.GEOMACRO_BASE_URL).then(x=>{
   console.log(JSON.stringify(x));
   if(!x.same_runtime_cache_hit_observed)process.exitCode=2;
 }).catch(e=>{console.error(e.message);process.exitCode=1});
}

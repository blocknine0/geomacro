import {createHash} from "node:crypto";
import {defineEventHandler,getRequestHeader,getRequestHost,readBody} from "h3";
import {executeHybridChatTurn} from "../../../../src/lib/hybrid-agent-chat.server";
import {prepareHybridAgentContext} from "../../../../src/lib/hybrid-agent-context";
import {ASK_GEOMACRO_MAX_LENGTH,AskGeomacroRateLimitError} from "../../../../src/lib/ask-geomacro-core.server";

/** POST-only, same-origin browser stream. The user's question lives in a
 * bounded JSON body, never a query string or upstream publisher request. */
function clientHash(value:string){
 return createHash("sha256").update("geomacro-public-ask-client-v1\0")
   .update(value.slice(0,128)).digest("hex");
}
type Stage="researching"|"finalizing";
function frame(event:"stage"|"answer"|"error",payload:Record<string,unknown>):Uint8Array{
 // Event names are STATIC allowlisted literals; JSON.stringify escapes input
 // newlines. Never embed raw user-provided SSE field content.
 return new TextEncoder().encode("event: "+event+"\ndata: "+JSON.stringify(payload)+"\n\n");
}
function reject(code:number,reason:string){
 return new Response(JSON.stringify({ok:false,error:{code:reason,message:reason}}),{
  status:code,headers:{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow"}});
}
function sameOrigin(origin:string,host:string):boolean{
 try{
  const url=new URL(origin);
  return (url.protocol==="https:"||url.protocol==="http:") && url.host.toLowerCase()===host.toLowerCase();
 }catch{return false;}
}
export default defineEventHandler(async event=>{
 const origin=getRequestHeader(event,"origin")??"";
 const host=getRequestHost(event);
 if(!sameOrigin(origin,host))return reject(403,"ASK_ORIGIN_FORBIDDEN");
 const type=getRequestHeader(event,"content-type")??"";
 if(!/^application\/json(?:;|$)/iu.test(type))return reject(415,"ASK_JSON_REQUIRED");
 const contentLength=Number(getRequestHeader(event,"content-length")??0);
 if(!Number.isFinite(contentLength)||contentLength>8_192||contentLength<0)
   return reject(413,"ASK_BODY_LIMIT");
 let raw:unknown;
 try{raw=await readBody(event);}catch{return reject(400,"ASK_JSON_INVALID");}
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return reject(400,"ASK_CONTEXT_INVALID");
 const body=raw as Record<string,unknown>;
 if(Object.keys(body).some(k=>k!=="question"&&k!=="history"))
   return reject(400,"ASK_CONTEXT_INVALID");
 const context=prepareHybridAgentContext(body.question,body.history);
 if(!context.ok||context.question.length>ASK_GEOMACRO_MAX_LENGTH)return reject(400,"ASK_CONTEXT_INVALID");
 const client=clientHash(String(getRequestHeader(event,"cf-connecting-ip")??"unknown"));
 // SSE exposes stages and the *completed* governed answer only. Token text
 // must never leave the server before verification; do not claim model tokens.
 const stream=new ReadableStream<Uint8Array>({
  async start(controller){
   const emit=(name:"stage"|"answer"|"error",data:Record<string,unknown>)=>{
    try{controller.enqueue(frame(name,data));}catch{/* disconnected */ }
   };
   emit("stage",{stage:"researching" satisfies Stage});
   try{
    const result=await executeHybridChatTurn({question:context.question,history:context.history},client);
    emit("stage",{stage:"finalizing" satisfies Stage});
    emit("answer",{ok:true,data:result.answer,context:{
     mode:result.mode,resolved_question:result.resolved_question,
     context_turns:result.context_turns}});
   }catch(error){
    const code=error instanceof AskGeomacroRateLimitError?"ASK_RATE_LIMITED":
     error instanceof Error&&error.message==="AMBIGUOUS_FOLLOW_UP"?
     "ASK_CLARIFY_FOLLOW_UP":"ASK_UNAVAILABLE";
    emit("error",{ok:false,error:{code,message:code==="ASK_UNAVAILABLE"?
     "Verified research is temporarily unavailable. Please retry.":code==="ASK_CLARIFY_FOLLOW_UP"?
     "Please name the topic you mean, or ask a complete question in Geopolitics, Macro Economics or Critical Minerals.":
     "Too many requests. Please wait a minute before trying again."}});
   }finally{try{controller.close();}catch{/* disconnected */}}
  }
 });
 return new Response(stream,{status:200,headers:{
  "Content-Type":"text/event-stream; charset=utf-8",
  "Cache-Control":"no-store, no-transform",
  "Connection":"keep-alive",
  "X-Accel-Buffering":"no",
  "X-Robots-Tag":"noindex, nofollow",
  "X-Content-Type-Options":"nosniff",
 }});
});

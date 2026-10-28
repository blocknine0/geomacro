import type {AskAnswer} from "./ask-geomacro.functions";
export type AskStreamStage="researching"|"finalizing";
export class LegacyAskTransportOnlyError extends Error {
 constructor(){super("ASK_STREAM_ROUTE_UNAVAILABLE");}
}
type Turn=Readonly<{role:"user"|"assistant";content:string}>;
export type StreamedAsk={answer:AskAnswer;resolvedQuestion:string};
const MAX_EVENT_BYTES=48_000;
const MAX_TOTAL_BYTES=96_000;
export function decodeAskEvent(frame:string){
 const event=frame.split("\n").find(line=>line.startsWith("event: "))?.slice(7).trim();
 const body=frame.split("\n").filter(line=>line.startsWith("data: ")).map(x=>x.slice(6)).join("\n");
 if(!["stage","answer","error"].includes(event??"")||body.length>MAX_EVENT_BYTES)
   throw Error("ASK_STREAM_EVENT_INVALID");
 const payload:unknown=JSON.parse(body);
 if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("ASK_STREAM_EVENT_INVALID");
 return {event:event as "stage"|"answer"|"error",payload:payload as Record<string,unknown>};
}
/** The response is SSE *progress* plus a fully verified bounded final answer.
 * Never append speculative token text to the chat transcript. */
export async function streamPublicAsk(
  question:string,history:readonly Turn[],onStage?:(stage:AskStreamStage)=>void, signal?:AbortSignal,
):Promise<StreamedAsk>{
 let response:Response;
 try {
   response=await fetch("/api/ask/v2/turn",{
     method:"POST",
     headers:{Accept:"text/event-stream","Content-Type":"application/json"},
     credentials:"same-origin",cache:"no-store",
     // A nonresponsive newer stream must not consume the entire browser
     // request timeout; the original same-origin GET remains a backstop.
     signal:signal ? AbortSignal.any([signal, AbortSignal.timeout(17_000)]) : AbortSignal.timeout(17_000),
     body:JSON.stringify({question,history:history.slice(-8)}),
   });
 }catch(error){
   if(signal?.aborted) throw signal.reason ?? new DOMException("Stopped", "AbortError");
   if(error instanceof TypeError||
      (error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)))
     throw new LegacyAskTransportOnlyError();
   throw error;
 }
 // Preview/edge SPA hosts sometimes serve HTML 200 for missing API routes.
 // Only transport/missing-route failures may fall back; NEVER 401/403/429 or
 // a real SSE event:error, which may be a security or rate-limit verdict.
 if([404,405,501,502,503,504].includes(response.status))
   throw new LegacyAskTransportOnlyError();
 if(!response.ok)throw Error("Ask Geomacro stream unavailable ("+response.status+").");
 if(!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream"))
   throw new LegacyAskTransportOnlyError();
 if(!response.body)throw new LegacyAskTransportOnlyError();
 const reader=response.body.getReader();
 const decoder=new TextDecoder("utf-8",{fatal:true});
 let buffer="",total=0;
 let completed:StreamedAsk|null=null;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_TOTAL_BYTES)throw Error("ASK_STREAM_RESPONSE_OVERSIZE");
   buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
   if(buffer.length>MAX_EVENT_BYTES)throw Error("ASK_STREAM_FRAME_OVERSIZE");
   let boundary=buffer.indexOf("\n\n");
   while(boundary>=0){
    const {event,payload}=decodeAskEvent(buffer.slice(0,boundary));
    buffer=buffer.slice(boundary+2);
    if(event==="stage"&&(payload.stage==="researching"||payload.stage==="finalizing"))
      onStage?.(payload.stage);
    if(event==="error")throw Error(
      typeof (payload.error as Record<string,unknown>|undefined)?.message==="string"?
      String((payload.error as Record<string,unknown>).message):"Ask Geomacro research unavailable.");
    if(event==="answer"){
      if(payload.ok!==true||!payload.data||typeof payload.data!=="object"||
         Array.isArray(payload.data))throw Error("ASK_STREAM_ANSWER_INVALID");
      const answer=payload.data as AskAnswer;
      if(typeof answer.summary!=="string"||typeof answer.insufficient_evidence!=="boolean"||
         !Array.isArray(answer.evidence))throw Error("ASK_STREAM_ANSWER_INVALID");
      const context=payload.context as Record<string,unknown>|undefined;
      completed={answer,resolvedQuestion:typeof context?.resolved_question==="string"&&
       context.resolved_question.length<=1200?context.resolved_question:question};
    }
    boundary=buffer.indexOf("\n\n");
   }
  }
 }catch(error){
   if(signal?.aborted) throw signal.reason ?? new DOMException("Stopped", "AbortError");
   // Network/body disconnect only; never retry a correctly framed SSE
   // verification rejection, which must remain a visible error.
   if(error instanceof TypeError||
      (error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)))
     throw new LegacyAskTransportOnlyError();
   throw error;
 }finally{reader.releaseLock();}
 if(!completed)throw new LegacyAskTransportOnlyError();
 return completed;
}

/** Stop must settle the UI even when a proxy buffers the network abort. */
export function withAskCancellation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
 return new Promise<T>((resolve,reject)=>{
  const cancel=()=>reject(signal.reason ?? new DOMException("Stopped","AbortError"));
  if(signal.aborted){cancel();return;}
  signal.addEventListener("abort",cancel,{once:true});
  operation.then(resolve,reject).finally(()=>signal.removeEventListener("abort",cancel));
 });
}

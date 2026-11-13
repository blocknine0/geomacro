import {createHash} from "node:crypto";
import {getHeader,setResponseHeaders,setResponseStatus,type H3Event} from "h3";

type Entry={body:unknown;etag:string;freshUntil:number;hardUntil:number;pending?:Promise<void>};
const entries=new Map<string,Entry>();
const MAX_ENTRIES=32,SOFT_MS=60_000,HARD_MS=300_000;
const cacheControl="public, max-age=60, stale-while-revalidate=300";

function matches(header:string|undefined,etag:string){
 return String(header??"").split(",").some(value=>{
  const tag=value.trim();return tag==="*"||tag===etag||tag.startsWith("W/")&&tag.slice(2)===etag;
 });
}
function etagFor(body:unknown){
 return '"sha256-'+createHash("sha256").update(JSON.stringify(body)).digest("hex")+'"';
}
function headers(event:H3Event,etag:string){
 setResponseHeaders(event,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":cacheControl,ETag:etag,"X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, nofollow"});
}
function reply(event:H3Event,entry:Entry){
 headers(event,entry.etag);
 if(matches(getHeader(event,"if-none-match"),entry.etag)){
  setResponseStatus(event,304);return null;
 }
 return entry.body;
}
function remember(key:string,body:unknown,now:number){
 const entry:Entry={body,etag:etagFor(body),freshUntil:now+SOFT_MS,hardUntil:now+HARD_MS};
 entries.delete(key);entries.set(key,entry);
 while(entries.size>MAX_ENTRIES)entries.delete(entries.keys().next().value!);
 return entry;
}

/** Request-coalesced public JSON cache. It caches only successful envelopes. */
export async function publicResponseCache(event:H3Event,key:string,
 produce:()=>Promise<unknown>,now=Date.now()){
 let cached=entries.get(key);
 if(cached&&now<cached.hardUntil){
  if(now>=cached.freshUntil&&!cached.pending){
   cached.pending=produce().then(body=>{
    if(body&&typeof body==="object"&&(body as {ok?:unknown}).ok===true)
     Object.assign(cached!,remember(key,body,Date.now()));
   }).catch(()=>undefined).finally(()=>{if(cached)delete cached.pending});
  }
  return reply(event,cached);
 }
 if(cached?.pending){await cached.pending;cached=entries.get(key);if(cached&&now<cached.hardUntil)return reply(event,cached)}
 const body=await produce();
 if(body&&typeof body==="object"&&(body as {ok?:unknown}).ok===true){
  const entry=remember(key,body,now);return reply(event,entry);
 }
 setResponseHeaders(event,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 return body;
}

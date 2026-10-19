/** Bounded first-party source reuse, process-local to one ingestion.
 * A shared publisher article is NOT corroboration, scoring, rights or a
 * reason to publish in all categories. No persistent or global cache. */
import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
const ROOT="https://www.minister.industry.gov.au";
const INDEX=ROOT+"/king/media?type=media_releases";
const ARTICLE=/^\/king\/media\/[a-z0-9][a-z0-9-]{12,170}$/u;
type Document={status:number;mime:string;body:string|null};
export type RunScopedAustralianResourcesFetch={
  fetch:(url:string)=>Promise<Response>;
  stats:()=>{unique_documents_read:number;repeat_requests_reused:number};
};
function allow(url:string){
  if(typeof url!=="string"||url.length>320)throw Error("OFFICIAL_SHARED_URL_INVALID");
  let u:URL;
  try{u=new URL(url)}catch{throw Error("OFFICIAL_SHARED_URL_INVALID")}
  const isIndex=u.href===INDEX;
  const isArticle=u.origin===ROOT&&!u.search&&!u.hash&&ARTICLE.test(u.pathname);
  if(u.origin!==ROOT||u.username||u.password||u.port||(!isIndex&&!isArticle))
    throw Error("OFFICIAL_SHARED_URL_NOT_ALLOWLISTED");
  return {key:u.href,max:isIndex?512*1024:256*1024};
}
async function readBounded(res:Response,max:number){
  if(!res.ok||!res.body)return null;
  const raw=res.headers.get("content-length");
  if(raw!==null&&(!/^\d+$/u.test(raw)||Number(raw)>max))return null;
  const reader=res.body.getReader();let length=0;const items:Uint8Array[]=[];
  try{
    for(;;){
      const next=await reader.read();if(next.done)break;
      length+=next.value.byteLength;
      if(length>max)return null;
      items.push(next.value);
    }
    const combined=new Uint8Array(length);let offset=0;
    for(const part of items){combined.set(part,offset);offset+=part.byteLength}
    return new TextDecoder("utf-8",{fatal:true}).decode(combined);
  }catch{return null}finally{await reader.cancel().catch(()=>undefined)}
}
export function createRunScopedAustralianResourcesFetch(
  fetchImpl:typeof fetch=fetch,
):RunScopedAustralianResourcesFetch{
  const memo=new Map<string,Promise<Document>>();let repeated=0;
  return Object.freeze({
    async fetch(url:string){
      const {key,max}=allow(url);
      let job=memo.get(key);
      if(job)repeated++;
      else{
        if(memo.size>=16)throw Error("OFFICIAL_SHARED_DOCUMENT_BUDGET_EXCEEDED");
        job=(async()=>{
          const res=await fetchWithoutRedirectUsing(fetchImpl,key,{
            method:"GET",redirect:"error",cache:"no-store",
            headers:{Accept:"text/html"},signal:AbortSignal.timeout(5_000),
          });
          const mime=res.headers.get("content-type")??"";
          const good=/^text\/html(?:;|$)/iu.test(mime);
          const body=good?await readBounded(res,max):null;
          return {status:res.status,mime,body};
        })();
        memo.set(key,job);
      }
      const row=await job;
      // Each category receives its own independently consumable stream.
      return new Response(row.body,{status:row.status,
        headers:{"content-type":row.mime}});
    },
    stats:()=>({unique_documents_read:memo.size,repeat_requests_reused:repeated}),
  });
}

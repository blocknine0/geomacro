#!/usr/bin/env node
/**
 * Read-only probe of EXACT official Beehive/WTO RSS candidates. No raw items,
 * text, URLs in receipts, credentials, Supabase, model/Telegram or payments.
 * HTTP 200 plus HTML error/WAF is not successful XML feed activation.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const SOURCES=Object.freeze([
  {id:"NZ_ALL_RSS",url:"https://www.beehive.govt.nz/rss.xml"},
  {id:"NZ_RELEASES_RSS",url:"https://www.beehive.govt.nz/releases/feed"},
  {id:"WTO_NEWS_RSS",url:"https://www.wto.org/library/rss/latest_news_e.xml"},
]);
export async function probeOfficialTradeNewsFeeds({fetchImpl=fetch,timeout=9000}={}){
 if(!Number.isSafeInteger(timeout)||timeout<500||timeout>15000)
   throw Error("OFFICIAL_RSS_BOUNDED_TIMEOUT_REQUIRED");
 const rows=[];
 for(const source of SOURCES){
  const row={source_id:source.id,http_status:null,mime_class:"UNKNOWN",
   verified_rss_envelope:false,item_count:0,raw_body_logged:false,
   credential_required:false,original_article_reverified:false,
   commercial_rights_granted:false};
  try{
   const res=await fetchImpl(source.url,{
    method:"GET",redirect:"manual",cache:"no-store",
    headers:{"Accept":"application/rss+xml, application/xml, text/xml"},
    signal:AbortSignal.timeout(timeout),
   });
   row.http_status=res.status;
   const mime=(res.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   const xmlTypes=new Set(["application/rss+xml","application/xml","text/xml"]);
   row.mime_class=xmlTypes.has(mime)?"XML":
     mime==="text/html"?"HTML_NOT_RSS":"OTHER_UNVERIFIED";
   if(res.status===200 && row.mime_class==="XML" &&
      Number(res.headers.get("content-length")||0)<=192000){
    const reader=res.body?.getReader();
    if(!reader){row.mime_class="UNREADABLE";rows.push(row);continue;}
    let length=0,txt="";
    try{
     const decoder=new TextDecoder("utf-8",{fatal:true});
     for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>192000){row.mime_class="TOO_LARGE";break;}
      txt+=decoder.decode(value,{stream:true});
     }
     txt+=decoder.decode();
     if(length<=192000 && !/<!DOCTYPE|<!ENTITY/iu.test(txt) &&
       /<rss(?:\s|>)/iu.test(txt) && /<item(?:\s|>)/iu.test(txt)){
      row.verified_rss_envelope=true;
      row.item_count=Math.min(500,[...txt.matchAll(/<item(?:\s[^>]*)?>/giu)].length);
     }else if(row.mime_class==="XML")row.mime_class="XML_INVALID_OR_NO_ITEMS";
    }finally{await reader.cancel().catch(()=>undefined);}
   }else{await res.body?.cancel().catch(()=>undefined);}
  }catch {row.mime_class="NETWORK_OR_TIMEOUT";}
  rows.push(row);
 }
 return {
  schema:"geomacro.nz-wto-official-feed-transport-diagnostic.v1",
  checked_at:new Date().toISOString(),
  three_exact_official_endpoints_only:true,rows,
  source_html_or_403_not_trusted_as_xml:true,
  publisher_licence_still_required:true,
  no_new_original_claim:true,
  no_raw_sources_or_payload_logged:true,
  no_b2_d1_supabase_or_funds:true,
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await probeOfficialTradeNewsFeeds()));}
 catch{console.error("OFFICIAL_RSS_READONLY_DIAGNOSTIC_FAILED");process.exitCode=2;}
}

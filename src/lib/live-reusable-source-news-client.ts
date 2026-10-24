/** Strict public Cloudflare D1 reader for registered source-news factual JSON.
 * Separate from verified/GRO/paid source products. Max three 200-row pages.
 */
import {REUSABLE_NEWS_JSON_SCHEMA} from "./reusable-news-json";
const ENDPOINT=
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/reusable-source-news";
export type SourceNewsJsonItem={
  schema:typeof REUSABLE_NEWS_JSON_SCHEMA;
  id:string;category:"geopolitics"|"macro"|"rare_earth";
  country_iso3:null;
  source:{publisher_name:null;original_url:null;original_published_at:string};
  usage_rights:{commercial_reuse_authorized:false;article_specific_permission_verified:false};
  delivery:{raw_article_included:false;downstream_paid_product_authorized:false};
  verification:{original_page_verified:false};
};
export async function fetchAllReusableSourceNews(fetchImpl:typeof fetch=fetch,now=Date.now()){
  const items:SourceNewsJsonItem[]=[];
  const seen=new Set<string>();
  let states:Record<string,number>={};
  for(const offset of [0,200,400]){
    const url=ENDPOINT+(offset?"?offset="+offset:"");
    const res=await fetchImpl(url,{redirect:"error",cache:"no-store",
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
    if(!res.ok||Number(res.headers.get("content-length")??0)>540_000)
      throw Error("SOURCE_NEWS_JSON_WORKER_UNAVAILABLE");
    const raw=await res.text();
    if(raw.length>540_000)throw Error("SOURCE_NEWS_JSON_BODY_TOO_LARGE");
    const doc=JSON.parse(raw) as Record<string,unknown>;
    if(doc.ok!==true||doc.schema!=="geomacro.reusable-source-news-feed.v1"||
       doc.item_schema!==REUSABLE_NEWS_JSON_SCHEMA||
       doc.commercial_product_ready!==false||
       doc.public_raw_article_delivery!==false||
       doc.article_licenses_automatically_granted!==false||
       doc.offset!==offset||doc.page_size!==200||
       !Array.isArray(doc.items)||doc.items.length>200||
       typeof doc.has_more!=="boolean"||
       !doc.checked_source_states||typeof doc.checked_source_states!=="object")
      throw Error("SOURCE_NEWS_JSON_CONTRACT_INVALID");
    if(offset===0){
      for(const [key,value] of Object.entries(doc.checked_source_states as object)){
        if(!/^[A-Z_]{3,50}$/u.test(key)||
           !Number.isSafeInteger(value)||Number(value)<0)
          throw Error("SOURCE_NEWS_JSON_STATUS_INVALID");
        states[key]=Number(value);
      }
    }
    for(const row of doc.items as SourceNewsJsonItem[]){
      const at=Date.parse(row?.source?.original_published_at??"");
      if(row?.schema!==REUSABLE_NEWS_JSON_SCHEMA||
         !/^news-[0-9a-f]{64}$/u.test(row.id)||
         !["geopolitics","macro","rare_earth"].includes(row.category)||
         row.country_iso3!==null||
         row.source?.publisher_name!==null||row.source?.original_url!==null||
         !Number.isFinite(at)||at>now||at<now-72*3600000||
         row.usage_rights?.commercial_reuse_authorized!==false||
         row.usage_rights?.article_specific_permission_verified!==false||
         row.delivery?.raw_article_included!==false||
         row.delivery?.downstream_paid_product_authorized!==false||
         row.verification?.original_page_verified!==false||
         seen.has(row.id))
        throw Error("SOURCE_NEWS_JSON_ITEM_INVALID");
      seen.add(row.id);items.push(row);
    }
    if(!doc.has_more){
      if(doc.next_offset!==null)throw Error("SOURCE_NEWS_JSON_PAGINATION_INVALID");
      return {items,checked_source_states:states};
    }
    if(doc.next_offset!==offset+200||offset>=400)
      throw Error("SOURCE_NEWS_JSON_PAGINATION_INVALID");
  }
  throw Error("SOURCE_NEWS_JSON_PAGINATION_INCOMPLETE");
}

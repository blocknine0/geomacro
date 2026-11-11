/**
 * Bounded targeted search for an event with only one source.
 * Google News and GDELT are discovery indexes; this never creates a verified
 * original, a commercial rights claim, or a signed GRO.
 */
import {parseGoogleRiskRss} from "./daily-risk-gate-generator.mjs";
const PIN="https://news.google.com";
const CATS=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const host=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.hostname.toLowerCase().replace(/^www\./u,""):null}catch{return null}};
const safeText=(v,n)=>typeof v==="string"&&v.length>=2&&v.length<=n&&
 !/[<>{}\r\n\\]/u.test(v)&&!/site:|when:|after:|before:/iu.test(v);
const banned=new Set(["the","that","with","from","after","before","government","official","latest","report","update","news","country","markets"]);
export function planSingleSourceOpenProbe(seed,{now=Date.now()}={}){
 if(!seed||!CATS.has(seed.category)||!safeText(seed.target_name,100)||
   !safeText(seed.headline,300)||!Number.isFinite(now)||
   !/^[a-z0-9.-]{3,253}$/u.test(seed.publisher_root_domain??""))
  throw Error("OPEN_OSINT_SEARCH_INPUT_INVALID");
 const terms=[...new Set(seed.headline.toLowerCase().normalize("NFKC")
  .match(/[\p{L}\p{N}]{4,}/gu)?.filter(w=>!banned.has(w))??[])].slice(0,6);
 if(terms.length<2)throw Error("OPEN_OSINT_SEARCH_TOO_VAGUE");
 const query='"'+seed.target_name+'" '+terms.map(s=>'"'+s+'"').join(" ")+
  " -site:"+seed.publisher_root_domain+" when:2d";
 const u=new URL(PIN+"/rss/search");
 u.searchParams.set("q",query);
 u.searchParams.set("hl","en-US");
 u.searchParams.set("gl","US");
 u.searchParams.set("ceid","US:en");
 if(u.href.length>1200)throw Error("OPEN_OSINT_SEARCH_URL_TOO_LONG");
 return {url:u.href,source_domain_excluded:seed.publisher_root_domain,
  category:seed.category,discovery_only:true,publisher_original_verified:false,
  independent_same_event_verified:false,commercial_rights_verified:false};
}
export async function runSingleSourceOpenProbe(seed,{
 fetcher=fetch,now=Date.now(),maxHits=6
}={}){
 const plan=planSingleSourceOpenProbe(seed,{now});
 if(!Number.isSafeInteger(maxHits)||maxHits<1||maxHits>10)
  throw Error("OPEN_OSINT_SEARCH_HIT_LIMIT_INVALID");
 const response=await fetcher(plan.url,{
  method:"GET",redirect:"manual",cache:"no-store",
  headers:{"Accept":"application/rss+xml,application/xml;q=0.9"},
  signal:AbortSignal.timeout(8000)});
 if(response?.status!==200||response.redirected||
   response.url&&host(response.url)!=="news.google.com"||
   Number(response.headers?.get("content-length")||0)>250000)
  return {status:"SEARCH_PROVIDER_UNAVAILABLE",leads:[],search_queries:1,
   original_publications_verified:0,paid_delivery_authorized:false};
 const body=await response.text();
 if(new TextEncoder().encode(body).length>250000)
  throw Error("OPEN_OSINT_SEARCH_RESPONSE_OVERSIZE");
 const rows=await parseGoogleRiskRss(body,now);
 const seen=new Set(),leads=[];
 for(const row of rows){
  const h=host("https://"+row.publisher_host);
  if(!h||h===seed.publisher_root_domain||
    h.endsWith("."+seed.publisher_root_domain)||
    seed.publisher_root_domain.endsWith("."+h)||seen.has(h))continue;
  seen.add(h);
  leads.push({...row,
   source_class:"SEARCH_INDEX_LEAD_ONLY",original_publisher_verified:false,
   source_rights_verified:false,same_event_verified:false});
  if(leads.length>=maxHits)break;
 }
 return {status:leads.length?"DISCOVERY_LEADS_FOUND":"NO_SECOND_DOMAIN_FOUND",
  leads,search_queries:1,original_publications_verified:0,
  paid_delivery_authorized:false};
}

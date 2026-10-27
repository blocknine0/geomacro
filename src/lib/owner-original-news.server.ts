import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";

/**
 * Main GeoMacro reads owner-group ORIGINAL first-party feed alert receipts from
 * the private Telegram producer. It does not access producer's Supabase DB,
 * send Telegram messages, ingest group posts, or mark facts VERIFIED.
 */
const SOURCE_HOSTS:Readonly<Record<string,string>>={
 un_geneva:"www.ungeneva.org",eu_council:"www.consilium.europa.eu",
 white_house_actions:"www.whitehouse.gov",
 bis_press:"www.bis.org",bank_canada:"www.bankofcanada.ca",
 bank_japan:"www.boj.or.jp",govuk_economy:"www.gov.uk",
 bc_minerals:"news.gov.bc.ca",doe_minerals:"www.energy.gov",
 govuk_minerals:"www.gov.uk",govuk_rare_earth:"www.gov.uk"
};
export type OwnerOriginalNewsAlert={
 id:string;category:"GEOPOLITICS"|"MACRO"|"CRITICAL_MINERALS";
 source_id:string;title:string;article_url:string;published_at:string;delivered_at:string;
};
export type OwnerOriginalNewsRead={
 status:"NOT_CONFIGURED"|"AVAILABLE"|"UNAVAILABLE";
 verification_status:"UNVERIFIED";commercial_eligible:false;
 items:OwnerOriginalNewsAlert[];
};
function trustedConfig(){
 const raw=String(process.env.GEOMACRO_OWNER_NEWS_READ_URL??"").trim();
 const token=String(process.env.GEOMACRO_OWNER_NEWS_READ_TOKEN??"").trim();
 if(token.length<32||!raw)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.search||url.hash||url.pathname!=="/v1/private/owner-news"||
     !url.hostname.includes(".")||url.hostname==="localhost"||
     /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname))
   return null;
  return {url:url.toString(),token};
 }catch{return null;}
}
function eligibleRow(value:unknown,now:number):value is OwnerOriginalNewsAlert{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 if(Object.keys(row).length!==7||!/^([a-f0-9]{64})$/u.test(String(row.id))||
    !["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].includes(String(row.category))||
    typeof row.source_id!=="string"||!Object.hasOwn(SOURCE_HOSTS,row.source_id)||
    typeof row.title!=="string"||row.title.length<15||row.title.length>220||
    typeof row.article_url!=="string")return false;
 try{
  const url=new URL(row.article_url);
  if(url.protocol!=="https:"||url.hostname!==SOURCE_HOSTS[row.source_id]||
     url.username||url.password||url.port||url.hash||url.href.length>1800)return false;
 }catch{return false;}
 const date=Date.parse(String(row.published_at)),sent=Date.parse(String(row.delivered_at));
 return Number.isFinite(date)&&Number.isFinite(sent)&&date<=now+60000&&
   now-date<=25*3600000&&date<=sent+60000&&sent<=now+60000;
}
export async function readOwnerOriginalNews(
 fetcher:typeof fetch=fetch,now=Date.now()
):Promise<OwnerOriginalNewsRead>{
 const config=trustedConfig();
 if(!config)return {status:"NOT_CONFIGURED",verification_status:"UNVERIFIED",
  commercial_eligible:false,items:[]};
 try {
  const response=await fetchWithoutRedirectUsing(fetcher,config.url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:`Bearer ${config.token}`,Accept:"application/json"},
   signal:AbortSignal.timeout(9000)
  });
  if(!response.ok||response.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json"||
     Number(response.headers.get("content-length")??0)>45000)
   throw Error("OWNER_ORIGINAL_READER_BAD_HTTP");
  const raw=await response.text();
  if(raw.length>45000)throw Error("OWNER_ORIGINAL_READER_OVERSIZED");
  const reply:unknown=JSON.parse(raw);
  if(!reply||typeof reply!=="object"||Array.isArray(reply))throw Error("OWNER_ORIGINAL_READER_INVALID");
  const o=reply as Record<string,unknown>;
  if(Object.keys(o).length!==5||
     o.schema!=="geomacro.private-owner-original-news.v1"||
     o.source!=="FIRST_PARTY_OFFICIAL_RELEASES"||
     o.verification_status!=="UNVERIFIED"||o.commercial_eligible!==false||
     !Array.isArray(o.items)||o.items.length>50)throw Error("OWNER_ORIGINAL_READER_UNTRUSTED");
  const items:OwnerOriginalNewsAlert[]=[];
  for(const row of o.items){
   if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).length!==7)
    throw Error("OWNER_ORIGINAL_READER_UNSAFE_ROW");
   // A previously sent original item may be older than 25h; simply exclude it.
   const original=Date.parse(String(row.published_at));
   if(!Number.isFinite(original)||original<now-25*3600000)continue;
   if(!eligibleRow(row,now))throw Error("OWNER_ORIGINAL_READER_UNSAFE_ROW");
   items.push(row);
  }
  return {status:"AVAILABLE",verification_status:"UNVERIFIED",commercial_eligible:false,items};
 }catch{
  return {status:"UNAVAILABLE",verification_status:"UNVERIFIED",commercial_eligible:false,items:[]};
 }
}

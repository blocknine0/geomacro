/** Ukraine-only ReliefWeb V2 metadata read-through for authenticated P0-B research.
 * Report catalogue publication is not independently verified article/event proof.
 * No report body, excerpt, partner redistribution, or paid promotion.
 */
import {p0bProjectEvidenceBounded} from "./p0b-event-grounded-projection.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";

const digest=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",
 new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const validUrl=u=>{
 try{
  const v=new URL(u);
  return v.protocol==="https:"&&v.hostname==="reliefweb.int"&&
   !v.username&&!v.password&&!v.port&&!v.hash&&v.pathname.length<900?v.href:null;
 }catch{return null}
};
export async function p0bReliefWebUkraine({appname,fetchImpl=fetch,now=Date.now()}={}){
 if(typeof appname!=="string"||!/^[A-Za-z][A-Za-z0-9_.-]{7,100}$/u.test(appname))
  return {status:"RELIEFWEB_APPNAME_UNAVAILABLE",items:[],attempted:false};
 const url=new URL("https://api.reliefweb.int/v2/reports");
 url.searchParams.set("appname",appname);
 const query={preset:"latest",profile:"list",limit:5,
  filter:{field:"country.iso3",value:"UKR"},
  sort:["date.created:desc"],
  fields:{include:["title","url","date.created","date.original","country.iso3"]}};
 let data;
 try{
  const r=await fetchImpl(url.href,{method:"POST",redirect:"manual",
   headers:{"Accept":"application/json","Content-Type":"application/json"},
   body:JSON.stringify(query),signal:AbortSignal.timeout(9000)});
  if(r.status!==200||r.redirected||!/json/iu.test(r.headers.get("content-type")??"")||
    Number(r.headers.get("content-length")??0)>240000)
   return {status:"RELIEFWEB_UNAVAILABLE",items:[],attempted:true};
  const raw=await r.text();
  if(raw.length>240000)return {status:"RELIEFWEB_UNAVAILABLE",items:[],attempted:true};
  data=JSON.parse(raw);
 }catch{return {status:"RELIEFWEB_UNAVAILABLE",items:[],attempted:true}}
 if(!Array.isArray(data?.data))
  return {status:"RELIEFWEB_UNAVAILABLE",items:[],attempted:true};
 const items=[];
 for(const row of data.data.slice(0,5)){
  const f=row?.fields;
  if(!Array.isArray(f?.country)||!f.country.some(c=>c?.iso3==="UKR"))continue;
  const title=f?.title,url=validUrl(f?.url);
  if(typeof title!=="string"||title.length<18||title.length>260||
   /[<>]/u.test(title)||!url)continue;
  // An original source publication clock is preferred to ReliefWeb's
  // catalogue creation clock; neither proves independent event truth.
  const originalMs=officialItemNativePublicationMs(f?.date?.original);
  const nativeMs=Number.isFinite(originalMs)?originalMs:
    officialItemNativePublicationMs(f?.date?.created);
  if(!Number.isFinite(nativeMs)||nativeMs>now+60000||
    now-nativeMs>72*3600000)continue;
  const native=new Date(nativeMs).toISOString();
  const category="geopolitics";
  const record_id=await digest(category+"\\n"+url+"\\n"+native);
  const fact_hash=await digest("UKR"+"geopolitics"+String(f?.date?.created??"")+title);
  const base={schema:"geomacro.phase2h.private-five-part.v1",
   what_happened:{text:null,original_observation_id:record_id},
   why_it_matters:{text:null,independently_verified:false},
   market_relevance:{potential_watch_channels:["trade_and_logistics"],
    observed_market_reaction_verified:false,confirmed_instruments:[],
    price_direction:null,price_change:null},
   what_to_watch:{event_topic:null,
    trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
    confirmed_followup_at:null},
   evidence_and_confidence:{original_observation_id:record_id,
    source_published_at:native,date_precision:"exact",
    observed_feed_title_available:true,original_article_page_verified:false,
    independent_event_verified:false,commercial_rights_verified:false,
    paid_eligible:false,source_content_identity_sha256:fact_hash}};
  const five_part=p0bProjectEvidenceBounded({record_id,category,
   original:{original_title:title,original_url:url,
    original_published_at:native,original_content:null},analysis:base});
  if(!five_part)continue;
  items.push({record_id,category,original_published_at:native,five_part,
   first_party_feed_metadata_verified:false,
   reliefweb_catalogue_metadata_verified:true,
   original_page_independently_verified:false,archive_d1_ack_present:false,
   p0a_evidence_limited:false,paid_eligible:false,
   commercial_rights_verified:false,source_title_only_research_fallback_used:false});
  if(items.length===2)break;
 }
 return {status:items.length?"RELIEFWEB_CATALOGUE_METADATA_GROUNDED":"RELIEFWEB_NO_MATCH",
  items,attempted:true};
}

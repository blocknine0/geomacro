// Exact first-party UK ONS Labour Market Statistics (LMS) dataset release.
// Source metadata ONLY, never an unemployment observation or risk score.
export const ONS_LMS_RELEASE_URL=
 "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourmarketstatistics/current";
// ONS's current first-party HTML landing exceeded 512 KiB on exact-main.
// Keep a strict 2 MiB streaming cap; one GET/day, no large LMS CSV download.
const MAX_BYTES=2*1024*1024,DAY=86_400_000;
const MONTHS=Object.freeze(["January","February","March","April","May","June","July","August",
 "September","October","November","December"]);
function visibleText(html){
 // Bounded tag scanner, no regex stripping of script or irregular closers.
 let i=0,out="",blocked=null;
 while(i<html.length){
  if(html.startsWith("<!--",i)){
   const end=html.indexOf("-->",i+4);if(end<0)break;i=end+3;continue;
  }
  if(html[i]==="<"){
   const end=html.indexOf(">",i+1);if(end<0)break;
   const content=html.slice(i+1,end).trimStart();
   const closing=content.startsWith("/");
   const normalized=(closing?content.slice(1):content).trimStart();
   let n=0;while(n<normalized.length&&/[a-z0-9:-]/iu.test(normalized[n]))n++;
   const tag=normalized.slice(0,n).toLowerCase();
   if(blocked){
    if(closing&&tag===blocked)blocked=null;
   }else if(!closing&&["script","style","noscript","template"].includes(tag))blocked=tag;
   if(!blocked)out+=" ";
   i=end+1;continue;
  }
  if(!blocked)out+=html[i];
  i++;
 }
 return out.replaceAll("&nbsp;"," ").replaceAll("&#160;"," ").replace(/\s+/gu," ").trim();
}
function nativeCalendarDay(context,label){
 // Match the FIRST release label only, bounded before old superseded versions.
 const from=context.indexOf(label);
 if(from<0)return null;
 const value=context.slice(from+label.length,from+label.length+120);
 const m=/^\s*:?\s*([1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/iu.exec(value);
 if(!m)return null;
 const year=Number(m[3]),month=MONTHS.findIndex(x=>x.toLowerCase()===m[2].toLowerCase()),day=Number(m[1]);
 if(month<0)return null;
 const d=new Date(Date.UTC(year,month,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month&&d.getUTCDate()===day?
   d.toISOString().slice(0,10):null;
}
export function inspectOnsLabourMarketRelease(html,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("ONS_CLOCK_INVALID");
 if(typeof html!=="string"||Buffer.byteLength(html,"utf8")>MAX_BYTES||
    !/<html(?:\s|>)/iu.test(html))throw Error("ONS_LMS_HTML_INVALID");
 const text=visibleText(html);
 const title=text.indexOf("Labour market statistics time series");
 const ref=text.indexOf("Dataset ID:");
 if(title<0||ref<0||!/^Dataset ID:\s*LMS\b/iu.test(text.slice(ref,ref+80))||
    title>ref)throw Error("ONS_LMS_PUBLISHER_DATASET_UNVERIFIED");
 const scope=text.slice(title,Math.min(text.length,title+7500));
 const latest=nativeCalendarDay(scope,"Release date");
 const next=nativeCalendarDay(scope,"Next release");
 if(!latest)throw Error("ONS_LMS_NATIVE_RELEASE_DATE_UNVERIFIED");
 const end=new Date(latest+"T00:00:00Z").getTime();
 const today=new Date(now.toISOString().slice(0,10)+"T00:00:00Z").getTime();
 if(end>today||end<today-400*DAY)throw Error("ONS_LMS_RELEASE_CLOCK_INVALID");
 const age=Math.round((today-end)/DAY);
 return {
  schema:"geomacro.ons-lms-national-reference-release.v1",
  source_family:"uk_ons_public",country_iso3:"GBR",category:"macro",
  dataset_id:"LMS",source_native_release_day:latest,
  publisher_announced_next_release_day:next,
  release_age_days:age,
  status:age<=45?"FIRST_PARTY_DATASET_RELEASE_DATE_OBSERVED":"FIRST_PARTY_DATASET_RELEASE_STALE",
  observed_unemployment_value_verified:false,
  native_month_or_rolling_quarter_observation_verified:false,
  current_fx_rate_verified:false,
  commercial_derived_rights_verified:false,
  signed_current_macro_or_risk_event:false,
  original_html_stored:false,raw_source_values_exposed:false,
  d1_writes:0,b2_requests:0,supabase_requests:0,payments:0
 };
}
async function readBounded(response){
 if([401,403,429].includes(response.status))throw Error("ONS_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("ONS_HTTP_UNAVAILABLE");
 const declared=Number(response.headers.get("content-length")||0);
 if(declared>MAX_BYTES){
  const failure=Error("ONS_BODY_LIMIT");
  failure.declared_bytes=declared;
  throw failure;
 }
 if(!response.body)throw Error("ONS_BODY_EMPTY");
 let n=0;const chunks=[],reader=response.body.getReader();
 try{for(;;){
  const {done,value}=await reader.read();if(done)break;
  n+=value.byteLength;if(n>MAX_BYTES)throw Error("ONS_BODY_LIMIT");
  chunks.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const b=new Uint8Array(n);let offset=0;
 for(const part of chunks){b.set(part,offset);offset+=part.byteLength}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}
 catch{throw Error("ONS_UTF8_UNVERIFIED")}
}
export async function observeOnsLabourMarketRelease({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("ONS_CLOCK_INVALID");
 const r=await fetchImpl(ONS_LMS_RELEASE_URL,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
  headers:{accept:"text/html"}
 });
 return inspectOnsLabourMarketRelease(await readBounded(r),now);
}

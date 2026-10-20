// Official Chilean Central Bank seven / COCHILCO monthly copper production
// reference page. Read metadata only; not real-time mine disruptions or rates.
export const CHILE_COPPER_MONTHLY_OFFICIAL_URL=
 "https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_IND_SEC/MN_IND_SEC20/IS_MIN2?idSerie=F034.PCUM.FLU.COCHILCO.Z.0.M";
const LIMIT=384*1024;
const MONTHS=Object.freeze({
 Ene:1,Feb:2,Mar:3,Abr:4,May:5,Jun:6,Jul:7,Ago:8,Sep:9,
 Oct:10,Nov:11,Dic:12
});
function cleanVisible(html){
 let text="",i=0,blocked="";
 while(i<html.length){
  if(html[i]==="<"){
   const end=html.indexOf(">",i+1);
   if(end<0)break;
   const element=html.slice(i+1,end).trim().toLowerCase();
   const closing=element.startsWith("/");
   const tag=element.replace(/^\//u,"").split(/[\s/>]/u,1)[0];
   if(["script","style","noscript","template"].includes(tag)){
    if(!closing)blocked=tag;else if(blocked===tag)blocked="";
   }
   if(!blocked)text+=" ";
   i=end+1;
  }else{
   if(!blocked)text+=html[i];i++;
  }
 }
 return text.replace(/\s+/gu," ").slice(0,75000);
}
export function inspectChileanCopperMonthly(html,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("CHILE_CLOCK_INVALID");
 if(typeof html!=="string"||Buffer.byteLength(html,"utf8")>LIMIT||
   !/<html(?:\s|>)/iu.test(html))throw Error("CHILE_OFFICIAL_HTML_INVALID");
 const text=cleanVisible(html);
 if(!/Producci[oó]n cobre de mina/iu.test(text)||
    !/COCHILCO/iu.test(text)||
    !/mensual/iu.test(text)||!text.includes("F034.PCUM.FLU.COCHILCO.Z.0.M"))
   throw Error("CHILE_OFFICIAL_SERIES_NOT_CONFIRMED");
 const observed=[];
 const nowMonth=now.getUTCFullYear()*12+now.getUTCMonth();
 // A display month is a reference period, not the original issuer release day.
 // Only accept month/year labels from numeric observation entries
 // ("Ago.2026: 366,3"). Generic page-update timestamps such as
 // "Actualizado: 13.Oct.2026" are NEVER mine production periods.
 const re=/\b(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\.?(20\d{2})\s*:\s*[0-9][0-9.,]{0,20}\b/gu;
 for(const match of text.slice(0,12000).matchAll(re)){
  const year=Number(match[2]),month=MONTHS[match[1]];
  const index=year*12+(month-1);
  if(index>nowMonth||index<nowMonth-36)continue;
  const period=match[2]+"-"+String(month).padStart(2,"0");
  if(!observed.includes(period))observed.push(period);
 }
 observed.sort().reverse();
 const latest=observed[0]??null;
 const lag=latest?nowMonth-(Number(latest.slice(0,4))*12+Number(latest.slice(5,7))-1):null;
 return {
  schema:"geomacro.chile-official-monthly-copper-reference.v1",
  source_family:"chile_central_bank_cochilco",country_iso3:"CHL",
  official_series_identifier:"F034.PCUM.FLU.COCHILCO.Z.0.M",
  latest_observed_reference_month:latest,
  reference_months_visible:observed.length,
  reference_lag_months:lag,
  status:!latest?"SERIES_PRESENT_NO_PARSEABLE_REFERENCE_PERIOD":
   lag<=4?"OFFICIAL_MONTHLY_REFERENCE_PRESENT":"OFFICIAL_MONTHLY_REFERENCE_STALE",
  // HTML period could occur outside the table; no numeric cell acceptance.
  exact_period_value_verified:false,native_publication_clock_verified:false,
  live_mine_events_verified:false,commercial_derived_rights_verified:false,
  raw_producer_numbers_exposed:false,customer_paid_eligible:false,
  d1_writes:0,b2_requests:0,supabase_requests:0,payments:0
 };
}
async function limitedHtml(response){
 if([401,403,429].includes(response.status))throw Error("CHILE_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("CHILE_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>LIMIT)throw Error("CHILE_BODY_LIMIT");
 if(!response.body)throw Error("CHILE_BODY_EMPTY");
 const reader=response.body.getReader(),parts=[];let count=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   count+=value.length;if(count>LIMIT)throw Error("CHILE_BODY_LIMIT");
   parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const all=new Uint8Array(count);let n=0;
 for(const part of parts){all.set(part,n);n+=part.length}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(all)}
 catch{throw Error("CHILE_UTF8_UNVERIFIED")}
}
export async function observeChileanCopperMonthly({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("CHILE_CLOCK_INVALID");
 const response=await fetchImpl(CHILE_COPPER_MONTHLY_OFFICIAL_URL,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
  headers:{accept:"text/html"}
 });
 return inspectChileanCopperMonthly(await limitedHtml(response),now);
}

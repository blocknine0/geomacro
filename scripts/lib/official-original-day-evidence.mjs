/**
 * #2041 Canada.ca NRCan and Statistics Canada original DAY evidence, not
 * a precise publication instant. Free official publisher data frequently has
 * a YYYY-MM-DD release day without timezone-bearing first-publication time.
 * A day never upgrades exact 22h / 60m signed GRI or x402 eligibility.
 */
const DAY_MS=86_400_000;
const MONTHS=["January","February","March","April","May","June",
 "July","August","September","October","November","December"];
const VALID_META=new Set(["dcterms.issued","datepublished","article:published_time"]);
function realDay(text){
 if(typeof text!=="string"||!/^(20\d\d)-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/u.test(text))
   return null;
 const n=Date.parse(text+"T00:00:00Z");
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===text?text:null;
}
function firstPartyPath(url){
 let u;
 try{u=new URL(url);}catch{return null;}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash)return null;
 if(u.hostname==="www.canada.ca"||u.hostname==="canada.ca"){
  const m=/^\/en\/natural-resources-canada\/news\/(20\d\d)\/(0[1-9]|1[0-2])\/[a-z0-9-]{1,140}\.html$/u.exec(u.pathname);
  return m?{issuer:"canada_nrcan",year:m[1],month:m[2],day:null}:null;
 }
 if(u.hostname==="www150.statcan.gc.ca"){
  const m=/^\/n1\/(?:en\/)?daily-quotidien\/((?:2\d){1}\d{4})\/dq\1[a-z][a-z0-9-]{0,35}-eng\.(?:htm|html)$/u.exec(u.pathname);
  if(!m)return null;
  return {issuer:"statcan_daily",day:"20"+m[1].slice(0,2)+"-"+m[1].slice(2,4)+"-"+m[1].slice(4,6)};
 }
 return null;
}
function attr(tag,key){
 const pattern=new RegExp("(?:^|\\s)"+key+"\\s*=\\s*([\"'])([^\"']{1,100})\\1","iu");
 return pattern.exec(tag)?.[2]??"";
}
function metaOriginalDates(html){
 const lowered=html.toLowerCase(),values=[];
 let i=0;
 for(let scanned=0;scanned<60;scanned++){
  const begin=lowered.indexOf("<meta",i);
  if(begin<0)break;
  i=begin+5;
  if(!/[\s>]/u.test(lowered[i]??""))continue;
  const end=lowered.indexOf(">",i);
  if(end<0||end-begin>700)continue;
  const tag=html.slice(begin,end+1);i=end+1;
  const label=(attr(tag,"name")||attr(tag,"property")).toLowerCase();
  if(VALID_META.has(label))values.push(attr(tag,"content"));
 }
 return values;
}
/**
 * Return a date-only observed original; caller must use date_precision=day.
 * Strictly no publisher inferred 08:30 Eastern time, artificial zone,
 * feed <updated> or HTML modification as a first-publication timestamp.
 * Bounded 72h candidate window is separate from product-level freshness.
 */
export function verifyCanadaOriginalDayEvidence({articleUrl,html,now=new Date()}={}){
 const origin=firstPartyPath(articleUrl);
 if(!origin||typeof html!=="string"||html.length>384*1024||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))return null;
 const values=metaOriginalDates(html);
 if(values.length<1||values.length>12)return null;
 const dates=values.map(realDay);
 if(dates.some(x=>!x)||new Set(dates).size!==1)return null;
 const day=dates[0];
 if(origin.issuer==="canada_nrcan" &&
   (!day.startsWith(origin.year+"-"+origin.month+"-")))return null;
 if(origin.issuer==="statcan_daily"&&day!==origin.day)return null;
 const earliest=Date.parse(day+"T00:00:00Z");
 // Day precision alone cannot prove any 22h event window; this guard just
 // ensures a recent original-day observation with conservative bounds.
 if(earliest>now.getTime()||now.getTime()-(earliest+DAY_MS)>3*DAY_MS)
   return null;
 return Object.freeze({publication_day:day,precision:"day",
   source_type:"original_publisher_day_only",
   verified_precise_publication_instant:false,
   commercial_rights_verified:false,
   independently_signed:false,chargeable:false});
}

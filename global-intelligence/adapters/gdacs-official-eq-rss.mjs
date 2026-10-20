// Same-publisher official GDACS EQ last-24h RSS fallback when verbose
// SEARCH GeoJSON hits its bounded response cap. No scraping or rights bypass.
import {officialItemNativePublicationMs} from "../../scripts/lib/official-native-item-publication-date.mjs";
export const GDACS_EQ_24H_RSS="https://data.gdacs.org/xml/rss_eq_24h.xml";
const MAX_BYTES=256*1024,MAX_ITEMS=80;
function field(item,name){
 const start="<"+name+">",end="</"+name+">";
 const a=item.indexOf(start);
 if(a<0)return "";
 const from=a+start.length,b=item.indexOf(end,from);
 if(b<0||b-from>200)return "";
 return item.slice(from,b).trim();
}
function* items(xml){
 let cursor=0,count=0;
 while(count<MAX_ITEMS){
  const start=xml.indexOf("<item>",cursor);
  if(start<0)break;
  const from=start+6,end=xml.indexOf("</item>",from);
  if(end<0)break;
  cursor=end+7;count++;
  if(end-from>8192)continue;
  yield xml.slice(from,end);
 }
}
export function parseGdacsOfficialEqRss(xml,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("GDACS_CLOCK_INVALID");
 if(typeof xml!=="string"||Buffer.byteLength(xml,"utf8")>MAX_BYTES ||
    !xml.includes("<rss")||!xml.includes("xmlns:gdacs=") ||
    xml.includes("<!DOCTYPE")||xml.includes("<!ENTITY"))
   throw Error("GDACS_RSS_SHAPE_INVALID");
 const features=[];let count=0;
 const seen=new Set();
 for(const item of items(xml)){
  const type=field(item,"gdacs:eventtype");
  const id=field(item,"gdacs:eventid");
  if(type!=="EQ"||!/^\d{1,14}$/u.test(id)||seen.has(id))continue;
  seen.add(id);count++;
  const iso3=field(item,"gdacs:iso3").toUpperCase();
  const country=field(item,"gdacs:country");
  const from=field(item,"gdacs:fromdate")||field(item,"pubDate");
  const millis=officialItemNativePublicationMs(from);
  const date=Number.isFinite(millis)&&millis<=now.getTime()?
    new Date(millis).toISOString():null;
  const lat=Number(field(item,"geo:lat")),lon=Number(field(item,"geo:long"));
  const validPoint=field(item,"geo:lat")!==""&&field(item,"geo:long")!==""&&
    Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
  features.push({type:"Feature",
   geometry:validPoint?{type:"Point",coordinates:[lon,lat]}:null,
   properties:{eventid:Number(id),iso3:/^[A-Z]{3}$/u.test(iso3)?iso3:null,
    country:country.length<=120?country:"",fromdate:date}});
 }
 if(count===0)throw Error("GDACS_RSS_NO_EQ_EVENTS");
 return {features};
}
async function readRssBody(response){
 if(!response.ok)throw Error("GDACS_RSS_HTTP_"+response.status);
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)throw Error("GDACS_RSS_BODY_LIMIT");
 if(!response.body)throw Error("GDACS_RSS_BODY_EMPTY");
 const rd=response.body.getReader(),parts=[];let size=0;
 try{for(;;){
  const {done,value}=await rd.read();if(done)break;
  size+=value.byteLength;
  if(size>MAX_BYTES)throw Error("GDACS_RSS_BODY_LIMIT");
  parts.push(value);
 }}finally{try{await rd.cancel()}catch{}rd.releaseLock()}
 const b=new Uint8Array(size);let i=0;
 for(const part of parts){b.set(part,i);i+=part.length}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}
 catch{throw Error("GDACS_RSS_ENCODING_INVALID")}
}
export async function gdacsOfficialEqRssCountryFallback({fetchImpl=fetch,now=new Date()}={}){
 const response=await fetchImpl(GDACS_EQ_24H_RSS,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
  headers:{accept:"application/rss+xml, application/xml"}
 });
 return parseGdacsOfficialEqRss(await readRssBody(response),now);
}

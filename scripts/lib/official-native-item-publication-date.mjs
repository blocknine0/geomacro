/**
 * Strict first-party item publication clock.
 * RSS pubDate: RFC 2822 with an explicit supported timezone.
 * Atom published: timezone-bearing ISO 8601. A feed <updated>, date-only,
 * timezone-less clock, publisher page modification and retrieval time
 * NEVER become event publication evidence.
 */
const ISO=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})$/iu;
const RFC=/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UTC|UT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[+-]\d{4})$/iu;
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function realCalendarDay(year,month,day) {
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()+1===month &&
    date.getUTCDate()===day;
}
function validOffset(text) {
  if(text==="Z" || /^[A-Z]+$/u.test(text)) return true;
  const match=/^([+-])(\d{2}):?(\d{2})$/u.exec(text);
  if(!match)return false;
  const hour=Number(match[2]),minute=Number(match[3]);
  return hour<=14 && minute<60 && !(hour===14 && minute!==0);
}
export function officialItemNativePublicationMs(raw) {
  if(typeof raw!=="string"||raw.length>256)return NaN;
  let value=raw.trim();
  if(value.startsWith("<![CDATA[")){
    const section=/^<!\[CDATA\[([\s\S]{1,180})\]\]>$/u.exec(value);
    if(!section)return NaN;
    value=section[1].trim();
  }
  if(!value||value.length>180||/[<>]|\p{Cc}|&(?:#|[A-Za-z])/u.test(value))
    return NaN;
  const iso=ISO.exec(value);
  if(iso){
    const [year,month,day,hour,minute,second]=
      [Number(iso[1]),Number(iso[2]),Number(iso[3]),Number(iso[4]),Number(iso[5]),Number(iso[6]??"0")];
    if(!realCalendarDay(year,month,day)||hour>23||minute>59||second>59||
       !validOffset(iso[8].toUpperCase()))return NaN;
    const normalized=value.replace(/([+-]\d{2})(\d{2})$/u,"$1:$2")
      .replace(/(\.\d{3})\d{1,6}(?=Z|[+-]\d{2}:\d{2}$)/iu,"$1");
    return Date.parse(normalized);
  }
  const rfc=RFC.exec(value);
  if(!rfc)return NaN;
  const month=MONTHS.findIndex(m=>m.toLowerCase()===rfc[3].toLowerCase())+1;
  const [day,year,hour,minute,second]=
    [Number(rfc[2]),Number(rfc[4]),Number(rfc[5]),Number(rfc[6]),Number(rfc[7]??"0")];
  const zone=rfc[8].toUpperCase();
  if(!realCalendarDay(year,month,day)||hour>23||minute>59||second>59||
     !validOffset(zone))return NaN;
  const dow=rfc[1]?.toLowerCase();
  if(dow && DAYS[new Date(Date.UTC(year,month-1,day)).getUTCDay()].toLowerCase()!==dow)
    return NaN;
  // RFC 2822 alpha zones are explicitly mapped to numeric UTC offsets;
  // never permit Date.parse environment-specific fallback interpretation.
  const zones={GMT:"+0000",UTC:"+0000",UT:"+0000",EST:"-0500",EDT:"-0400",
    CST:"-0600",CDT:"-0500",MST:"-0700",MDT:"-0600",PST:"-0800",PDT:"-0700"};
  const offset=Object.hasOwn(zones,zone)?zones[zone]:zone;
  return Date.parse(
    String(day).padStart(2,"0")+" "+MONTHS[month-1]+" "+year+" "+
    String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0")+":"+
    String(second).padStart(2,"0")+" "+offset
  );
}

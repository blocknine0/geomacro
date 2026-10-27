/** Official calendars; DST is evaluated at the release instant, never host time. */
export const MACRO_CALENDARS=Object.freeze([
 {id:'bls',url:'https://www.bls.gov/schedule/news_release/bls.ics'},
 {id:'fed',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'},
 {id:'ecb',url:'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'},
]);
export function zonedRelease(y,m,d,h,min,zone){
 const target=Date.UTC(y,m-1,d,h,min);let instant=target;
 for(let i=0;i<3;i++){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
  const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
  const delta=target-represented;if(!delta)break;instant+=delta;
 }
 const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
 return new Date(instant).toISOString();
}
const txt=s=>s.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ').trim();
export function parseMacroCalendar(id,body,now){
 if(typeof body!=='string'||body.length>384*1024||!Number.isFinite(now))throw Error('MACRO_CALENDAR_INVALID');
 const events=[];
 const add=(kind,at)=>{const ms=Date.parse(at);if(Number.isFinite(ms)&&ms>=now-3600000&&ms<=now+370*86400000)events.push({kind,at,source:id});};
 if(id==='bls'){
  if(!body.includes('BEGIN:VCALENDAR'))throw Error('BLS_CALENDAR_INVALID');
  const unfolded=body.replace(/\r?\n[ \t]/g,'');
  for(const m of unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)){
   const summary=/^SUMMARY:([^\r\n]+)/m.exec(m[1])?.[1];
   const kind=summary==='Consumer Price Index'?'cpi':summary==='Producer Price Index'?'ppi':summary==='Employment Situation'?'nfp':null;
   if(!kind)continue;
   const clock=/^DTSTART(?:;TZID=(US-Eastern|America\/New_York))?:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)\d\d(Z)?\s*$/m.exec(m[1]);
   if(!clock||!clock[1]&&!clock[7])continue;
   const at=clock[7]?new Date(Date.UTC(+clock[2],+clock[3]-1,+clock[4],+clock[5],+clock[6])).toISOString():zonedRelease(+clock[2],+clock[3],+clock[4],+clock[5],+clock[6],'America/New_York');
   add(kind,at);
  }
 }else if(id==='ecb'){
  for(const m of body.matchAll(/<dt\b[^>]*>\s*(\d\d)\/(\d\d)\/(20\d\d)\s*<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)){
   if(!/monetary policy meeting/i.test(txt(m[4]))||!/Day 2/i.test(txt(m[4]))||/non-monetary/i.test(txt(m[4])))continue;
   add('ecb_rates',zonedRelease(+m[3],+m[2],+m[1],14,15,'Europe/Berlin'));
  }
 }else if(id==='fed'){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  // Fixed FOMC year panel and native meeting month/date classes.
  const panels=[...body.matchAll(/<(?:h[2-6])\b[^>]*>(?:<a\b[^>]*>)?\s*(20\d{2}) FOMC Meetings(?:<\/a>)?<\/h[2-6]>/gi)];
  for(let i=0;i<panels.length;i++){
   const y=+panels[i][1];
   const yearBlock=body.slice(panels[i].index,panels[i+1]?.index??body.length);
   for(const m of yearBlock.matchAll(/class=["'][^"']*fomc-meeting__month[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]{0,300}?class=["'][^"']*fomc-meeting__date[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)){
    const month=months.indexOf(txt(m[1]))+1;
    const days=txt(m[2]).replace(/\*/g,'');if(!month||!/^\d{1,2}(?:[-–]\d{1,2})?$/.test(days))continue;
    const d=+days.split(/[-–]/).at(-1);add('fomc',zonedRelease(y,month,d,14,0,'America/New_York'));
   }
  }
 }else throw Error('MACRO_CALENDAR_UNKNOWN');
 return [...new Map(events.map(e=>[e.kind+'|'+e.at,e])).values()].sort((a,b)=>a.at.localeCompare(b.at)).slice(0,128);
}
export function releaseWindowEvents(events,now){
 return (Array.isArray(events)?events:[]).filter(e=>Number.isFinite(Date.parse(e.at))&&now>=Date.parse(e.at)-2*60000&&now<=Date.parse(e.at)+20*60000);
}
export function criticalSourceIds(events){
 return [...new Set(events.flatMap(e=>e.kind==='fomc'?['fed_press']:e.kind==='ecb_rates'?['ecb_press']:e.kind==='cpi'?['bls_cpi']:e.kind==='ppi'?['bls_ppi']:e.kind==='nfp'?['bls_employment']:[]))];
}

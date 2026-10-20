// Indonesia first-party Ministry of Energy and Mineral Resources (ESDM)
// press index. Read-only SOURCE DISCOVERY, never a signed minerals event.
export const INDONESIA_ESDM_PRESS_INDEX_URL="https://www.esdm.go.id/en/";
const BODY_LIMIT=512*1024,DAY=86_400_000;
const months={january:1,february:2,march:3,april:4,may:5,june:6,
 july:7,august:8,september:9,october:10,november:11,december:12,
 januari:1,februari:2,maret:3,mei:5,juni:6,juli:7,agustus:8,
 oktober:10,desember:12};
const mineral=/\b(?:nickel|nikel|lithium|litium|cobalt|kobalt|copper|tembaga|critical minerals?|mineral strategis|rare[- ]earths?|tanah jarang|bauxite|bauksit|graphite|grafit|tambang|mineral dan batubara|mineral and coal|mining)\b/iu;
function htmlText(html){
 // Bounded tag scanner instead of fragile regex HTML filtering. Explicitly
 // handles whitespace and attributes inside closing script/style tags.
 let out="",i=0,blocked=null;
 const ignored=new Set(["script","style","noscript","template"]);
 while(i<html.length){
  if(html.startsWith("<!--",i)){
   const end=html.indexOf("-->",i+4);
   if(end<0)break;
   i=end+3;continue;
  }
  if(html[i]==="<"){
   const end=html.indexOf(">",i+1);
   if(end<0)break;
   const inside=html.slice(i+1,end).trimStart();
   let k=inside.startsWith("/")?1:0;
   const closing=k===1;
   while(k<inside.length && /\s/u.test(inside[k]))k++;
   let t=k;
   while(t<inside.length && /[a-z0-9:-]/iu.test(inside[t]))t++;
   const tag=inside.slice(k,t).toLowerCase();
   if(blocked){
    if(closing&&tag===blocked)blocked=null;
   }else if(!closing&&ignored.has(tag))blocked=tag;
   if(!blocked)out+=" ";
   i=end+1;continue;
  }
  if(!blocked)out+=html[i];
  i++;
 }
 return out.replace(/&nbsp;|&#160;/giu," ")
   .replace(/&amp;/giu,"&").replace(/\s+/gu," ").trim();
}
function dayMs(dd,mm,yyyy){
 const day=Number(dd),year=Number(yyyy),m=months[mm.toLowerCase()];
 if(!m||day<1||day>31||year<2020||year>2100)return null;
 const time=Date.UTC(year,m-1,day);
 const when=new Date(time);
 if(when.getUTCFullYear()!==year||when.getUTCMonth()!==m-1||when.getUTCDate()!==day)return null;
 return time;
}
export function inspectIndonesiaEsdmIndex(html,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("ESDM_CLOCK_INVALID");
 if(typeof html!=="string"||Buffer.byteLength(html,"utf8")>BODY_LIMIT||
    !/<html(?:\s|>)/iu.test(html))throw Error("ESDM_HTML_INVALID");
 const text=htmlText(html);
 if(!/Kementerian Energi dan Sumber Daya Mineral|Ministry of Energy and Mineral Resources/iu.test(text))
   throw Error("ESDM_OFFICIAL_PUBLISHER_UNVERIFIED");
 const start=text.search(/\b(?:Press Release|Siaran Pers)\b/iu);
 const end=start<0?-1:text.slice(start+12).search(/\b(?:Key Reference|Dokumen Info Penting|EMR Highlight|Sorotan ESDM)\b/iu);
 if(start<0||end<0)throw Error("ESDM_OFFICIAL_PRESS_SECTION_MISSING");
 // The section may show several releases. Only native-dated announcements
 // in this exact section qualify as date-index leads, never the dashboard.
 const press=text.slice(start,start+12+end).slice(0,14000);
 const dates=[...press.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)?[,]?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Januari|Februari|Maret|Mei|Juni|Juli|Agustus|Oktober|Desember)\s+(20\d{2})\b/giu)].slice(0,20);
 const seen=new Set(),acceptable=[];
 for(const m of dates){
   const time=dayMs(m[1],m[2],m[3]);
   if(time===null||time>now.getTime()||now.getTime()-time>30*DAY)continue;
   const label=new Date(time).toISOString().slice(0,10);
   const after=press.slice(m.index+m[0].length,m.index+m[0].length+180);
   if(seen.has(label+"|"+after.slice(0,24)))continue;
   seen.add(label+"|"+after.slice(0,24));
   acceptable.push({day:label,topic:mineral.test(after)});
 }
 const relevant=acceptable.filter(x=>x.topic);
 const recent=relevant.filter(x=>now.getTime()-Date.parse(x.day+"T00:00:00Z")<=7*DAY);
 return {
   schema:"geomacro.indonesia-esdm-official-index.v1",
   publisher:"indonesia_esdm",country_iso3:"IDN",category:"rare_earth",
   status:relevant.length?"MINERAL_PRESS_INDEX_LEADS_OBSERVED":
     "OFFICIAL_PRESS_INDEX_READABLE_NO_MINERAL_LEADS",
   dated_index_entries_within_30d:acceptable.length,
   mineral_topic_index_candidates_within_30d:relevant.length,
   mineral_topic_index_candidates_within_7d:recent.length,
   latest_candidate_index_day:relevant.map(x=>x.day).sort().at(-1)??null,
   // Publication dates on a listing are leads, not verified original pages.
   first_party_article_original_verified:false,
   individual_item_native_timestamp_verified:false,
   observed_mine_supply_disruption_verified:false,
   all_195_country_mineral_coverage_verified:false,
   paid_derived_rights_verified:false,customer_delivery_enabled:false,
   raw_html_stored:false,raw_titles_stored:false,
   b2_requests:0,d1_writes:0,supabase_requests:0,payments:0
 };
}
async function bounded(response){
 if([401,403,429].includes(response.status))throw Error("ESDM_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("ESDM_UPSTREAM_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>BODY_LIMIT)throw Error("ESDM_BODY_LIMIT");
 if(!response.body)throw Error("ESDM_BODY_EMPTY");
 let size=0;const parts=[],reader=response.body.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>BODY_LIMIT)throw Error("ESDM_BODY_LIMIT");
   parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const b=new Uint8Array(size);let n=0;
 for(const p of parts){b.set(p,n);n+=p.length}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}
 catch{throw Error("ESDM_INVALID_UTF8")}
}
export async function observeIndonesiaEsdmIndex({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("ESDM_CLOCK_INVALID");
 const response=await fetchImpl(INDONESIA_ESDM_PRESS_INDEX_URL,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),headers:{accept:"text/html"}
 });
 return inspectIndonesiaEsdmIndex(await bounded(response),now);
}

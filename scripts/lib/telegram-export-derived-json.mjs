/**
 * Owner-supplied Telegram Desktop JSON exports -> private, unverified,
 * source-neutral derived facts. NO Telegram network/API or post URL fetching.
 * No export content is ever logged, retained in outputs, or embedded in errors.
 */
import {createHash} from "node:crypto";
import {hasExplicitCriticalMineralsDomainAnchor} from "./critical-minerals-domain-anchor.mjs";

export const TELEGRAM_EXPORT_SCHEMA="geomacro.telegram-export-derived.v1";
export const TELEGRAM_OWNER_RIGHTS="OWNER_DECLARED_TELEGRAM_DERIVED_ONLY";
export const TELEGRAM_SOURCE_PROVENANCE="TELEGRAM_PUBLIC_EXPORT";
export const TELEGRAM_EXPORT_LIMITS=Object.freeze({
 max_export_bytes:1024*1024, max_messages_per_file:2500,
 max_messages_per_run:40,max_derived_items_per_run:20,
 max_summary_chars:280,max_verbatim_words:6, retention_hours:72,
});
const sha=s=>createHash("sha256").update(s).digest("hex");
const POLITICS=/\b(?:sanction|embargo|ceasefire|military|conflict|armed|diplomac|treaty|election|peace talk|security council)\w*/iu;
const MACRO=/\b(?:inflation|cpi|interest rate|monetary|central bank|gdp|foreign exchange|currency|reserves?|fiscal|tariff|unemployment)\b/iu;
const CODES={
 geopolitics:[["SANCTIONS",/\b(?:sanction|embargo)\w*/iu],["CONFLICT",/\b(?:conflict|ceasefire|military|war|airstrike)\b/iu],["DIPLOMACY",/\b(?:diplomac|treaty|bilateral)\w*/iu]],
 macro:[["INFLATION",/\b(?:inflation|cpi|consumer prices?)\b/iu],["CENTRAL_BANK",/\b(?:interest rate|monetary|central bank)\b/iu],["FX_POLICY",/\b(?:foreign exchange|currency|reserves?|fx)\b/iu],["FISCAL_POLICY",/\b(?:fiscal|budget|treasury)\b/iu]],
 rare_earth:[["EXPORT_CONTROL",/\b(?:export ban|export control|export restriction)\w*/iu],["MINING_POLICY",/./u]],
};
function textField(value){
 if(typeof value==="string")return value;
 if(!Array.isArray(value))return "";
 return value.map(v=>typeof v==="string"?v:
   v&&typeof v==="object"&&typeof v.text==="string"?v.text:"").join("");
}
function sourceTime(row){
 const sec=String(row.date_unixtime??"");
 if(/^\d{9,11}$/u.test(sec)){
   const n=Number(sec)*1000;
   if(Number.isFinite(n)&&n>0)return {at:new Date(n).toISOString(),quality:"EXACT"};
 }
 // The display timestamp from Telegram Desktop lacks dependable timezone.
 return {at:null,quality:"UNKNOWN_TZ"};
}
function normalized(s){return s.normalize("NFKC").replace(/\s+/gu," ").trim()}
function lang(s){
 if(/[\u0980-\u09ff]/u.test(s))return "bn";
 if(/[\u0400-\u04ff]/u.test(s))return "ru";
 if(/[\u4e00-\u9fff]/u.test(s))return "zh";
 if(/[a-z]/iu.test(s))return "en";
 return "unknown";
}
function explicitNumbers(s){
 const output=[];
 const expression=/\b([0-9]{1,9}(?:\.[0-9]{1,3})?)\s*(%|percent|USD|EUR|INR|tonnes?|tons?|kg|kilograms?|Mt|million|billion|bps)\b/giu;
 for(const m of s.matchAll(expression)){
  output.push({value:m[1],unit:m[2].toLowerCase()});
  if(output.length>=5)break;
 }
 return output;
}
/** Resolve only unique exact canonical ISO3 or official country name/alias.
 * Publisher country is NEVER inferred from sender, chat name or IP.
 */
export function exactTelegramExportCountry(text,countryCodes,registry=[]){
 const normalize=x=>String(x).normalize("NFKC").toLocaleLowerCase("en")
   .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim();
 const normalized=" "+normalize(text)+" ";
 const labels=new Set();
 for(const code of new Set(text.match(/\b[A-Z]{3}\b/gu)??[]))
   if(countryCodes.has(code))labels.add(code);
 for(const row of registry){
   if(!countryCodes.has(row.iso3))continue;
   const names=[row.name,...(row.aliases??[])];
   for(const name of names){
     if(typeof name!=="string"||name.length<4)continue;
     const needle=normalize(name);
     if(needle&&normalized.includes(" "+needle+" ")){
       labels.add(row.iso3);break;
     }
   }
 }
 return labels.size===1?[...labels][0]:null;
}
function classify(s){
 const mineral=hasExplicitCriticalMineralsDomainAnchor(s);
 const political=POLITICS.test(s);
 const economics=MACRO.test(s);
 const hitCount=Number(mineral)+Number(political)+Number(economics);
 if(hitCount!==1)return null; // ambiguous != independently classified
 const category=mineral?"rare_earth":political?"geopolitics":"macro";
 const code=CODES[category].find(([,r])=>r.test(s))?.[0]??null;
 if(!code)return null;
 return {category,topic_code:code,confidence:0.65};
}
export function containsVerbatimSpan(summary,original,maxWords=TELEGRAM_EXPORT_LIMITS.max_verbatim_words){
 const a=normalized(summary).toLocaleLowerCase("en").split(/\s+/u);
 const b=normalized(original).toLocaleLowerCase("en").split(/\s+/u);
 if(a.length<maxWords||b.length<maxWords)return false;
 const hits=new Set();
 for(let i=0;i<=b.length-maxWords;i++)hits.add(b.slice(i,i+maxWords).join(" "));
 for(let i=0;i<=a.length-maxWords;i++)if(hits.has(a.slice(i,i+maxWords).join(" ")))return true;
 return false;
}
function authoredSummary(category,topic,numeric){
 const label={geopolitics:"Geopolitical claim",macro:"Macro/FX claim",rare_earth:"Critical-minerals claim"}[category];
 const detail={SANCTIONS:"mentions possible restrictions",CONFLICT:"mentions a security development",
 DIPLOMACY:"mentions diplomatic activity",INFLATION:"mentions an inflation indicator",
 CENTRAL_BANK:"mentions monetary policy",FX_POLICY:"mentions currency or reserves",
 FISCAL_POLICY:"mentions fiscal policy",EXPORT_CONTROL:"mentions export restrictions",
 MINING_POLICY:"mentions a minerals-related development"}[topic]??"requires review";
 const units=[...new Set(numeric.map(n=>n.unit))].slice(0,3);
 return label+" "+detail+"; unverified export-derived research only"+
   (units.length?". Explicit numeric units present: "+units.join(", "):"")+".";
}
function iterateChats(exportObject){
 if(!exportObject||typeof exportObject!=="object"||Array.isArray(exportObject))
   throw Error("TELEGRAM_EXPORT_FORMAT_INVALID");
 const chats=Array.isArray(exportObject.messages)?[exportObject]:
   Array.isArray(exportObject.chats?.list)?exportObject.chats.list:null;
 if(!chats||chats.length>50||chats.some(x=>!x||!Array.isArray(x.messages)))
   throw Error("TELEGRAM_EXPORT_FORMAT_INVALID");
 return chats;
}
export function projectTelegramExport(buffer,options={}){
 try{
  if(!Buffer.isBuffer(buffer)&&!(buffer instanceof Uint8Array))throw Error("BAD_BYTES");
  if(buffer.byteLength<2||buffer.byteLength>TELEGRAM_EXPORT_LIMITS.max_export_bytes)
   throw Error("FILE_SIZE");
  const now=options.now??Date.now();
  if(!Number.isFinite(now))throw Error("BAD_CLOCK");
  const allowedCountryCodes=options.countryCodes??new Set();
  const payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));
  const chats=iterateChats(payload);
  const seen=new Set(),records=[];
  let inspected=0,classified=0;
  for(const chat of chats){
   // Hash chat identity ONLY for internal multi-source admissibility; never return
   // a channel ID, username or chat hash in a public customer response.
   const chatKey=sha(JSON.stringify([chat.id??null,chat.name??null,chat.type??null]));
   for(const row of chat.messages){
    if(inspected>=TELEGRAM_EXPORT_LIMITS.max_messages_per_run)break;
    inspected++;
    if(!row||row.type!=="message")continue;
    const raw=normalized(textField(row.text));
    if(raw.length<20||raw.length>2000)continue;
    const normalizedHash=sha(raw.toLocaleLowerCase("en"));
    if(seen.has(normalizedHash))continue;
    seen.add(normalizedHash);
    const c=classify(raw);if(!c)continue;
    classified++;
    const time=sourceTime(row);
    if(time.at!==null&&(Date.parse(time.at)>now||now-Date.parse(time.at)>72*3600000))continue;
    // Only ISO3 explicitly included in message, with no alias/fuzzy guess.
    const country=exactTelegramExportCountry(raw,allowedCountryCodes,options.countryRegistry??[]);
    const nums=explicitNumbers(raw);
    const summary=authoredSummary(c.category,c.topic_code,nums);
    if(summary.length>TELEGRAM_EXPORT_LIMITS.max_summary_chars||
       containsVerbatimSpan(summary,raw))continue;
    const sourceNative=time.at;
    records.push({
     schema_version:TELEGRAM_EXPORT_SCHEMA,
     category:c.category,topic_code:c.topic_code,country_iso3:country,
     event_type:c.topic_code,derived_summary:summary,
     source_native_published_at:sourceNative,time_quality:time.quality,
     observed_at:new Date(now).toISOString(),
     provenance:TELEGRAM_SOURCE_PROVENANCE,rights_state:TELEGRAM_OWNER_RIGHTS,
     verification_status:"UNVERIFIED_CLAIM",confidence:c.confidence,
     numeric_mentions:nums,language:lang(raw),scored:false,execution_authorized:false,
     // Only in private B2/D1 research metadata, never in customer output.
     internal_message_fingerprint:normalizedHash,internal_chat_fingerprint:chatKey,
    });
    if(records.length>=TELEGRAM_EXPORT_LIMITS.max_derived_items_per_run)break;
   }
   if(inspected>=TELEGRAM_EXPORT_LIMITS.max_messages_per_run||
      records.length>=TELEGRAM_EXPORT_LIMITS.max_derived_items_per_run)break;
  }
  return {schema:"geomacro.telegram-export-project.v1",
   inspected,classified,items:records,
   source_content_stored:false,commercial_rights_verified:false,
   paid_flag_default_off:true};
 }catch{throw Error("TELEGRAM_EXPORT_PARSE_FAILED_CLOSED")}
}

#!/usr/bin/env node
import {readFileSync,writeFileSync} from "node:fs";
import {inflateRawSync} from "node:zlib";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {eventIdentityFields} from "../lib/risk-stream-event-fingerprint.mjs";
import {prioritizeApprovedAnchorSources} from "../lib/rights-redacted-speed-radar.mjs";
import {resolve,sep} from "node:path";

const fail=code=>{throw Error("RISK_STREAM_FEED_EXTENSION_"+code)};
const RIGHTS_PATH="config/risk-stream-source-rights-reviewed.v1.json";
const FEEDS_PATH="config/unified-rss-feed-registry.v1.json";
const MAX_FEED_BYTES=2_000_000;
const MAX_STRUCTURED_FEED_CANDIDATES=500;
const MAX_HTML_PAGE_FETCHES_PER_FEED=25;
const FED_H10_ENDPOINT="https://www.federalreserve.gov/feeds/data/H10_H10.XML";
const BOC_FX_ENDPOINT="https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=2";
const ECB_CURRENCY_COUNTRY={USD:"USA",GBP:"GBR",JPY:"JPN",CNY:"CHN",INR:"IND",KRW:"KOR",
 AUD:"AUS",CAD:"CAN",CHF:"CHE",BRL:"BRA",MXN:"MEX",PLN:"POL",SEK:"SWE",NOK:"NOR",
 TRY:"TUR",ZAR:"ZAF",SGD:"SGP",MYR:"MYS",THB:"THA",IDR:"IDN",PHP:"PHL"};
const GDELT_FIPS_COUNTRY={UK:"GBR",TU:"TUR",KS:"KOR",IZ:"IRQ",AE:"ARE",CH:"CHN",GM:"DEU",
 SF:"ZAF",CG:"COD",JA:"JPN",RS:"RUS",AS:"AUS",SP:"ESP",SZ:"CHE",SW:"SWE",UP:"UKR",
 SA:"SAU",IS:"ISR",MU:"OMN",NI:"NGA",ZA:"ZMB",CI:"CHL",BL:"BOL",VM:"VNM",SN:"SGP",
 RP:"PHL",BG:"BGD",MG:"MNG",BM:"MMR"};
const CATEGORY_BY_FEED={conflict:"GEOPOLITICS",macro_economics:"MACRO_FX",
 commodities:"CRITICAL_MINERALS"};
const RISK_CATEGORY_BY_RIGHTS={GEOPOLITICS:"conflict",MACRO_FX:"macro_economics",
 CRITICAL_MINERALS:"commodities"};
export const CRITICAL_MINERAL_SUPPLY_TERMS=/rare earth|ndpr|dysprosium|terbium|lithium|cobalt|nickel|copper|graphite|gallium|germanium|antimony|tungsten|manganese|vanadium|titanium|uranium|potash|phosphate|polysilicon|silicon|zinc|alumin(?:um|ium)|bauxite|alumina|indium|tellurium|bismuth|chromium|molybdenum|niobium|tantalum|zirconium|beryllium|scandium|platinum|palladium|rhodium|pgm|battery supply chain|semiconductor mineral|critical raw(?: material)?|smelter|smelting|refining capacity|mining royalty|critical mineral|mining|\bmine\b|refining|refinery|ore|metal|battery|supply chain|export control/iu;
const MACRO_FX_TERMS=/central bank|interest rate|fx reserve|currency|sovereign debt|bond yield|inflation|capital controls|crypto|cryptocurrency|bitcoin|\bbtc\b|ethereum|\beth\b|stablecoin|\busdc\b|\busdt\b|cbdc|digital asset|digital currency|\bdefi\b|tokenization|\bvasp\b|crypto exchange|etf flow/iu;
const CATEGORY_TERMS={
 GEOPOLITICS:[[/sanction|asset freeze|export control/iu,"sanctions_policy"],
  [/ceasefire|hostilities pause/iu,"ceasefire"],
  [/attack|missile|troops|military|conflict|war|gaza|ukraine/iu,"conflict_escalation"],
  [/tariff|trade restriction|trade disruption/iu,"trade_disruption"]],
 MACRO_FX:[[/central bank|interest rate|monetary policy|bank rate|inflation|sovereign debt|bond yield|capital controls/iu,"central_bank_policy"],
  [/crypto|cryptocurrency|bitcoin|\bbtc\b|ethereum|\beth\b|stablecoin|\busdc\b|\busdt\b|cbdc|digital asset|digital currency|\bdefi\b|tokenization|\bvasp\b|crypto exchange|etf flow|fx reserve/iu,"fx_intervention"],
  [/consumer prices/iu,"inflation_release"],
  [/currency|exchange rate|sterling|pound/iu,"fx_intervention"],
  [/trade|tariff|customs/iu,"trade_disruption"]],
 CRITICAL_MINERALS:[[/export ban|export control/iu,"critical_mineral_export_control"],
  [/production|mine output/iu,"critical_mineral_production"],
  [CRITICAL_MINERAL_SUPPLY_TERMS,"critical_mineral_supply"],
  [/trade|customs/iu,"trade_disruption"]]
};
const STRATEGIC_CORRIDORS=[
 [/\bRED SEA\b/iu,"Red Sea"],
 [/\bBAB[\s-]+EL[\s-]+MANDEB\b/iu,"Bab el Mandeb"],
 [/\b(?:STRAIT OF HORMUZ|HORMUZ)\b/iu,"Strait of Hormuz"],
 [/\bMALACCA\b/iu,"Malacca Strait"],
 [/\bSUEZ(?: CANAL)?\b/iu,"Suez Canal"],
 [/\bPANAMA(?: CANAL)?\b/iu,"Panama Canal"],
 [/\bTAIWAN STRAIT\b/iu,"Taiwan Strait"],
 [/\bSOUTH CHINA SEA\b/iu,"South China Sea"],
 [/\bBLACK SEA\b/iu,"Black Sea"],
 [/\bBOSPORUS\b/iu,"Bosporus"],
 [/\bBALTIC SEA\b/iu,"Baltic Sea"],
 [/\bNORTHERN SEA ROUTE\b/iu,"Northern Sea Route"],
 [/\bMOZAMBIQUE CHANNEL\b/iu,"Mozambique Channel"],
 [/\bCAPE OF GOOD HOPE\b/iu,"Cape of Good Hope"],
 [/\bGIUK GAP\b/iu,"GIUK Gap"]
];
const SIGNAL_THEMES=[
 [/maritime|shipping|vessel|port|freight|chokepoint|strait|canal/iu,"maritime"],
 [/missile|drone|airstrike|air strike|strike|intercept/iu,"strike"],
 [/sanction|tariff|export control|export ban|customs/iu,"trade_controls"],
 [/crypto|cryptocurrency|bitcoin|\bbtc\b|ethereum|\beth\b|stablecoin|\busdc\b|\busdt\b|cbdc|digital asset|digital currency|\bdefi\b|tokenization|\bvasp\b|crypto exchange|etf flow/iu,"crypto_macro"],
 [/central bank|interest rate|exchange rate|foreign exchange|\bfx\b|liquidity|currency|inflation|capital controls|bond yield|sovereign debt/iu,"central_bank_fx"],
 [CRITICAL_MINERAL_SUPPLY_TERMS,"minerals"]
];
const COUNTRY_ASSETS={AUS:"AUD rates, iron ore and LNG",COD:"cobalt, copper and refined-metal flows",
 KAZ:"uranium, copper and KZT funding",ZMB:"copper, cobalt and ZMW funding"};
export function buildDerivedSignal({theme,country,corridor,corpus,category,eventType}){
 const place=country+(corridor?` via ${corridor}`:"");
 const assets=Object.entries({cobalt:/cobalt/iu,copper:/copper/iu,lithium:/lithium/iu,
  nickel:/nickel/iu,"rare-earth oxides":/rare earth/iu,uranium:/uranium/iu,
  LNG:/\blng\b|liquefied natural gas/iu,oil:/oil|crude/iu}).find(([,rx])=>rx.test(corpus))?.[0]
  ??COUNTRY_ASSETS[country]??(category==="MACRO_FX"?"local FX and short-dated rates":
   category==="CRITICAL_MINERALS"?"ore, refined output and benchmark premiums":"freight, energy and trade finance");
 let signal;
 if(theme==="crypto_macro")signal={
  what:`${place}: digital-asset liquidity or policy shifts may affect local FX and funding access.`,
  why:`Stablecoin redemption, exchange liquidity and crypto-linked flows can transmit into ${country} payment rails and currency demand.`,
  market:`Monitor BTC/ETH, USDC/USDT peg spreads, exchange depth, ETF flows and ${country} FX basis.`,
  watch:`Over 24–72h, check stablecoin peg deviations, exchange net flows, ETF subscriptions, FX spreads and central-bank notices.`};
 else if(theme==="maritime")signal={
  what:`${place}: shipping or chokepoint pressure could alter transit time and cargo availability.`,
  why:`Longer routes can raise freight and war-risk cover, delaying ${assets} and working-capital settlement.`,
  market:`Watch ${assets}, bunker fuel, freight rates and marine-insurance costs for ${country}-linked cargoes.`,
  watch:`Over 24–72h, check route closures, vessel queues, freight quotes and insurance premia; flag sustained moves above recent ranges.`};
 else if(theme==="strike")signal={
  what:`${place}: reported strike or interception risk may interrupt nearby transport or production assets.`,
  why:`Damage, airspace limits or precautionary shutdowns can reduce ${assets} availability and raise delivery risk.`,
  market:`Track ${assets}, export-terminal throughput, freight costs and ${country} sovereign or currency risk.`,
  watch:`Over 24–72h, verify facility outages, flight or port restrictions, official damage counts and confirmed shipment delays.`};
 else if(theme==="trade_controls")signal={
  what:`${place}: a trade-control change may restrict licensing, pricing or counterparties for ${assets}.`,
  why:`Compliance checks can delay settlement and reroute supply, widening delivered costs and reducing accessible volumes.`,
  market:`Monitor ${assets}, export volumes, buyer premiums, ${country} FX and bank-settlement delays.`,
  watch:`Over 24–72h, check effective dates, licence notices, named product codes, customs holds and price or FX moves.`};
 else if(theme==="central_bank_fx")signal={
  what:`${place}: central-bank or FX conditions may change local funding and currency liquidity.`,
  why:`Rate expectations and intervention can shift hedging costs, import cover and sovereign funding conditions.`,
  market:`Watch ${country} currency pairs, short-dated yields, swap spreads and liquidity against ${assets}.`,
  watch:`Over 24–72h, compare official fixings, reserve or intervention notices, bid–ask spreads and 1–3 month forward points.`};
 else if(theme==="minerals")signal={
  what:`${place}: mining or processing conditions may change supply of ${assets}.`,
  why:`Output, power, transport or export constraints can alter refined availability, delivery timing and buyer premiums.`,
  market:`Track ${assets}, mine/refinery utilization, export volumes and benchmark-to-spot premiums.`,
  watch:`Over 24–72h, verify facility status, production guidance, port dispatches and measurable premium or futures moves.`};
 else signal={
  what:`${place}: ${eventType.replaceAll("_"," ")} is linked to ${assets}; exposure remains conditional on a verified operating or policy change.`,
  why:`The identified transmission runs through ${assets}, cross-border access and counterparties; confirm an effective notice or measured flow change before repricing.`,
  market:`Track dated changes in ${assets}, relevant trade volumes, local FX and sovereign funding spreads against their published reference periods.`,
  watch:`Over 24–72h, verify the effective date, a measured volume or price delta, and any settlement restriction; invalidate if the notice is withdrawn or the reference data is revised.`};
 return signal;
}
export const COUNTRY_TERMS={USA:["united states","united states of america","u.s.","u.s.a.","usa","american"],GBR:["united kingdom","great britain","britain","british","english","uk"],
 CHN:["china","chinese"],IND:["india","indian"],RUS:["russia","russian"],
 UKR:["ukraine","ukrainian"],ISR:["israel","israeli"],PSE:["palestine","palestinian","gaza"],
 IRN:["iran","iranian"],SAU:["saudi arabia","saudi"],ARE:["united arab emirates","uae"],
 AUS:["australia","australian"],CAN:["canada","canadian"],BRA:["brazil","brazilian"],
 ZAF:["south africa"],IDN:["indonesia","indonesian"],CHL:["chile","chilean"],PER:["peru","peruvian"],
 JPN:["japan","japanese"],KOR:["south korea","korea","korean"],BEL:["belgium","belgian"],DEU:["germany","german"],
 FRA:["france","french"],MEX:["mexico","mexican"],ITA:["italy","italian"],ESP:["spain","spanish"],NLD:["netherlands","dutch"],
 CHE:["switzerland","swiss"],NOR:["norway","norwegian"],SWE:["sweden","swedish"],POL:["poland","polish"],
 TUR:["turkey","türkiye","turkiye","turkish"],EGY:["egypt","egyptian"],QAT:["qatar","qatari"],OMN:["oman","omani"],
 IRQ:["iraq","iraqi"],NGA:["nigeria","nigerian"],COD:["democratic republic of the congo","d.r. of congo","d.r. congo","dr congo","drc","kinshasa","katanga","congo"],ZMB:["zambia","zambian","lusaka","copperbelt"],
 ARG:["argentina","argentine"],BOL:["bolivia","bolivian"],VNM:["vietnam","vietnamese"],THA:["thailand","thai"],
 MYS:["malaysia","malaysian"],SGP:["singapore","singaporean"],PHL:["philippines","philippine","filipino"],PAK:["pakistan","pakistani"],
 BGD:["bangladesh","bangladeshi"],KAZ:["kazakhstan","kazakh","astana","almaty"],MNG:["mongolia","mongolian"],MMR:["myanmar","burma","burmese"]};
const normalizeSovereignIso3=value=>value==="ATA"?"AUS":value;
export const HOT50=new Set(["USA","CHN","IND","RUS","GBR","DEU","FRA","JPN","KOR","BEL","CAN","AUS","BRA","MEX","ITA","ESP","NLD","CHE","NOR","SWE","POL","UKR","TUR","SAU","ARE","IRN","ISR","EGY","QAT","OMN","IRQ","ZAF","NGA","COD","ZMB","CHL","PER","ARG","BOL","IDN","VNM","THA","MYS","SGP","PHL","PAK","BGD","KAZ","MNG","MMR"]);
const HOT50_ISO2={US:"USA",CN:"CHN",IN:"IND",RU:"RUS",GB:"GBR",DE:"DEU",FR:"FRA",JP:"JPN",KR:"KOR",BE:"BEL",
 CA:"CAN",AU:"AUS",BR:"BRA",MX:"MEX",IT:"ITA",ES:"ESP",NL:"NLD",CH:"CHE",NO:"NOR",SE:"SWE",PL:"POL",UA:"UKR",
 TR:"TUR",SA:"SAU",AE:"ARE",IR:"IRN",IL:"ISR",EG:"EGY",QA:"QAT",OM:"OMN",IQ:"IRQ",ZA:"ZAF",NG:"NGA",CD:"COD",
 ZM:"ZMB",CL:"CHL",PE:"PER",AR:"ARG",BO:"BOL",ID:"IDN",VN:"VNM",TH:"THA",MY:"MYS",SG:"SGP",PH:"PHL",PK:"PAK",
 BD:"BGD",KZ:"KAZ",MN:"MNG",MM:"MMR"};
const HOT50_CURRENCY_COUNTRY={USD:"USA",CNY:"CHN",INR:"IND",RUB:"RUS",GBP:"GBR",EUR:"DEU",JPY:"JPN",KRW:"KOR",
 CAD:"CAN",AUD:"AUS",BRL:"BRA",MXN:"MEX",CHF:"CHE",NOK:"NOR",SEK:"SWE",PLN:"POL",TRY:"TUR",SAR:"SAU",
 AED:"ARE",IRR:"IRN",ILS:"ISR",EGP:"EGY",QAR:"QAT",OMR:"OMN",IQD:"IRQ",ZAR:"ZAF",NGN:"NGA",ZMW:"ZMB",
 CLP:"CHL",PEN:"PER",ARS:"ARG",BOB:"BOL",IDR:"IDN",VND:"VNM",THB:"THA",MYR:"MYS",SGD:"SGP",PHP:"PHL",
 PKR:"PAK",BDT:"BGD",KZT:"KAZ",MNT:"MNG",MMK:"MMR",DKK:"DEU",HUF:"DEU",CZK:"DEU",RON:"DEU"};
const hot50Iso3FromValue=value=>{
 const code=String(value??"").trim().toUpperCase();
 if(HOT50.has(code))return code;
 if(HOT50_ISO2[code])return HOT50_ISO2[code];
 return matchHot50Countries({},String(value??""))[0]??null;
};
export const SOURCE_COUNTRY={uk_fcdo_ogl_official_atom:"GBR",uk_obr_ogl_macro_atom:"GBR",
 uk_dbt_ogl_minerals_atom:"GBR",uk_hmt_ogl_official_atom:"GBR",uk_desnz_ogl_minerals_atom:"GBR",
 uk_mod_ogl_security_atom:"GBR",uk_cabinet_ogl_security_atom:"GBR",uk_bist_ogl_minerals_atom:"GBR",
 ecb_fx_reference_rates:"DEU",us_fed_h10_public_domain:"USA",usgs_minerals_public_domain:"USA",
 geoscience_australia_ccby:"AUS",eu_jrc_rmis_ccby:"BEL",
 bank_of_canada_fx_ogl:"CAN",rba_fx_ccby:"AUS"};
export function matchHot50Countries(entry={},corpus=`${entry.title??""} ${entry.summary??""}`,sourceId=null,maxCountries=3){
 const direct=[entry.country_iso3,...(entry.countries??[])].map(value=>String(value??"").toUpperCase());
 const mentioned=Object.entries(COUNTRY_TERMS).filter(([,names])=>names.some(name=>
  new RegExp(`(?:^|[^\\p{L}])${name.replaceAll(".","\\.")}(?:$|[^\\p{L}])`,'iu').test(corpus))).map(([iso])=>iso);
 const limit=Number.isInteger(maxCountries)?Math.max(1,Math.min(6,maxCountries)):3;
 const countries=[...new Set([...direct,...mentioned].map(normalizeSovereignIso3)
  .filter(iso=>HOT50.has(iso)&&iso!==SOURCE_COUNTRY[sourceId]))].slice(0,limit);
 if(!countries.length&&SOURCE_COUNTRY[sourceId])countries.push(SOURCE_COUNTRY[sourceId]);
 return countries;
}
const stripMarkup=value=>String(value??"").replace(/<[^>]*>/gu," ").replace(/&(?:amp|lt|gt|quot|apos);/gu,x=>
 ({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[x]??" ").replace(/\s+/gu," ").trim();
async function boundedText(response){
 const declared=response.headers?.get?.("content-length");
 if(declared&&Number(declared)>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_FEED_BYTES){await reader.cancel();fail("FEED_SIZE_INVALID")}
    chunks.push(value);
   }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 }
 const text=await response.text();
 if(typeof text!=="string"||Buffer.byteLength(text,"utf8")>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 return text;
}
async function boundedBytes(response){
 const declared=response.headers?.get?.("content-length");
 if(declared&&Number(declared)>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_FEED_BYTES){await reader.cancel();fail("FEED_SIZE_INVALID")}
    chunks.push(Buffer.from(value));
   }
  }finally{reader.releaseLock()}
  return Buffer.concat(chunks,size);
 }
 if(typeof response.arrayBuffer!=="function")fail("BINARY_RESPONSE_UNAVAILABLE");
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.byteLength>MAX_FEED_BYTES)fail("FEED_SIZE_INVALID");
 return bytes;
}
function unzipSingleDeflateEntry(zip){
 if(!Buffer.isBuffer(zip)||zip.length<22||zip.length>MAX_FEED_BYTES)fail("ZIP_SIZE_INVALID");
 const minimum=Math.max(0,zip.length-65_557);let end=-1;
 for(let i=zip.length-22;i>=minimum;i--)if(zip.readUInt32LE(i)===0x06054b50){end=i;break}
 if(end<0)fail("ZIP_DIRECTORY_MISSING");
 const entries=zip.readUInt16LE(end+10),directorySize=zip.readUInt32LE(end+12),directoryOffset=zip.readUInt32LE(end+16);
 if(entries!==1||directorySize>MAX_FEED_BYTES||directoryOffset+directorySize>end)fail("ZIP_ENTRY_COUNT_INVALID");
 if(zip.readUInt32LE(directoryOffset)!==0x02014b50)fail("ZIP_DIRECTORY_INVALID");
 const flags=zip.readUInt16LE(directoryOffset+8),method=zip.readUInt16LE(directoryOffset+10),
  compressedSize=zip.readUInt32LE(directoryOffset+20),uncompressedSize=zip.readUInt32LE(directoryOffset+24),
  nameLength=zip.readUInt16LE(directoryOffset+28),extraLength=zip.readUInt16LE(directoryOffset+30),
  commentLength=zip.readUInt16LE(directoryOffset+32),localOffset=zip.readUInt32LE(directoryOffset+42);
 if(flags&1||method!==8||compressedSize>MAX_FEED_BYTES||uncompressedSize>MAX_FEED_BYTES||
  directoryOffset+46+nameLength+extraLength+commentLength>end||localOffset+30>directoryOffset||
  zip.readUInt32LE(localOffset)!==0x04034b50)fail("ZIP_ENTRY_UNSUPPORTED");
 const localNameLength=zip.readUInt16LE(localOffset+26),localExtraLength=zip.readUInt16LE(localOffset+28),
  dataOffset=localOffset+30+localNameLength+localExtraLength;
 if(dataOffset+compressedSize>directoryOffset)fail("ZIP_ENTRY_TRUNCATED");
 let csv;try{csv=inflateRawSync(zip.subarray(dataOffset,dataOffset+compressedSize),
  {maxOutputLength:MAX_FEED_BYTES})}catch{fail("ZIP_DEFLATE_INVALID")}
 if(csv.byteLength!==uncompressedSize)fail("ZIP_UNCOMPRESSED_SIZE_MISMATCH");
 return csv.toString("utf8");
}
function parseCsvRows(csv){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<csv.length;i++){
  const char=csv[i];
  if(quoted){if(char==='"'&&csv[i+1]==='"'){field+='"';i++}else if(char==='"')quoted=false;else field+=char;continue}
  if(char==='"'&&field.length===0){quoted=true;continue}
  if(char===","){row.push(field);field="";continue}
  if(char==="\n"||char==="\r"){
   if(char==="\r"&&csv[i+1]==="\n")i++;
   row.push(field);field="";if(row.some(value=>value!==""))rows.push(row);row=[];continue;
  }
  field+=char;
 }
 if(quoted)fail("CSV_QUOTE_UNTERMINATED");
 if(field.length||row.length){row.push(field);rows.push(row)}
 return rows;
}
function gdeltEventEntries(csv,archiveUrl,now){
 const rows=csv.split(/\r?\n/u).filter(Boolean).map(line=>line.split("\t")),entries=[];
 for(const columns of rows){
  if(columns.length<59||!/^\d+$/u.test(columns[0])||!/^\d{8}$/u.test(columns[1]))continue;
  const [globalEventId,sqlDate]=columns,eventCode=columns[26],quadClass=columns[29],goldsteinScale=columns[30];
  if(!/^\d{1,4}$/u.test(eventCode)||!/^\d$/u.test(quadClass)||
   (goldsteinScale!==""&&!/^-?\d+(?:\.\d+)?$/u.test(goldsteinScale)))continue;
  const sourceUrl=columns[60]??"";
  let sourcePath="";try{sourcePath=new URL(sourceUrl).pathname.toLowerCase()}catch{}
  const category=/rare-earth|lithium|cobalt|nickel|copper|uranium|graphite|gallium|germanium|antimony|tungsten|mining|mineral|smelter|refining/iu.test(sourcePath)?
   "CRITICAL_MINERALS":/central-bank|interest-rate|currency|forex|inflation|bond-yield|sovereign-debt|crypto|bitcoin|stablecoin|cbdc/iu.test(sourcePath)?
   "MACRO_FX":"GEOPOLITICS";
  const eventType=category==="CRITICAL_MINERALS"?"critical_mineral_supply":
   category==="MACRO_FX"?"fx_intervention":
   /^(?:16|17)/u.test(eventCode)?"sanctions_policy":
   ["3","4"].includes(quadClass)?"conflict_escalation":null;
  if(!eventType)continue;
  const updated=`${sqlDate.slice(0,4)}-${sqlDate.slice(4,6)}-${sqlDate.slice(6,8)}T00:00:00.000Z`;
  const published=Date.parse(updated);
  if(!Number.isFinite(published)||published>now||now-published>72*60*60*1000)continue;
  const countries=[...new Set([columns[53],columns[7],columns[17]].map(code=>
   GDELT_FIPS_COUNTRY[code]??HOT50_ISO2[code]??hot50Iso3FromValue(code)).filter(code=>code&&HOT50.has(code)))];
  if(!countries.length)continue;
  entries.push({id:globalEventId,link:archiveUrl,updated,title:"GDELT factual event record",summary:"",
   gdelt_category:category,
   countries,country_iso3:countries[0],gdelt_facts:{global_event_id:globalEventId,sql_date:sqlDate,
    actor1_code:columns[5],actor2_code:columns[15],event_code:eventCode,quad_class:quadClass,
    event_type:eventType,goldstein_scale:goldsteinScale,action_geo_country_code:columns[53]}});
 }
 return entries;
}
const xmlText=value=>String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/&(?:amp|lt|gt|quot|apos);/gu,entity=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[entity]);

/** Extract only an explicitly publisher-supplied GeoMacro candidate extension. */
export function extractRiskStreamFeedExtensions(xml){
 if(typeof xml!=="string"||xml.length>2_000_000)fail("FEED_SIZE_INVALID");
 const rows=[];
 const pattern=/<((?:[A-Za-z_][\w.-]*:)?geomacro_risk_stream_candidate)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu;
 for(const match of xml.matchAll(pattern)){
  const raw=xmlText(match[2]).trim();
  let value;try{value=JSON.parse(raw)}catch{fail("JSON_INVALID")}
  if(!value||typeof value!=="object"||Array.isArray(value))fail("CANDIDATE_INVALID");
  rows.push(value);
 }
 return rows;
}

function fedH10Entries(xml,now){
 const current=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
 if(typeof xml!=="string"||!Number.isFinite(current))return [];
 const attribute=(text,name)=>text.match(new RegExp(`(?:^|\\s)${name}=["']([^"']+)["']`,'iu'))?.[1]??null;
 const valueById=(text,id)=>{
  for(const match of text.matchAll(/<(?:[\w.-]+:)?Value\b([^>]*)\/?\s*>/giu))
   if(attribute(match[1],"id")?.toUpperCase()===id)return attribute(match[1],"value");
  return null;
 };
 const textValue=(text,name)=>text.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([^<]+)<\\/(?:[\\w.-]+:)?${name}\\s*>`,'iu'))?.[1]?.trim()??null;
 const tagAttribute=(text,name,attr)=>{
  const tag=text.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*)\\/?\\s*>`,'iu'));
  return tag?attribute(tag[1],attr):null;
 };
 const entries=[];
 for(const seriesMatch of xml.matchAll(/<(?:[\w.-]+:)?Series\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?Series\s*>/giu)){
  const seriesAttrs=seriesMatch[1],series=seriesMatch[2];
  const currency=(attribute(seriesAttrs,"CURRENCY")??valueById(series,"CURRENCY")??textValue(series,"CURRENCY")??"").toUpperCase();
  const country_iso3=HOT50_CURRENCY_COUNTRY[currency];
  if(!country_iso3)continue;
  for(const obsMatch of series.matchAll(/<(?:[\w.-]+:)?Obs\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?Obs\s*>/giu)){
   const obsAttrs=obsMatch[1],obs=obsMatch[2];
   const timePeriod=attribute(obsAttrs,"TIME_PERIOD")??valueById(obs,"TIME_PERIOD")??
    tagAttribute(obs,"ObsDimension","value")??textValue(obs,"TIME_PERIOD");
   if(!/^\d{4}-\d{2}-\d{2}$/u.test(timePeriod??""))continue;
   const periodStart=Date.parse(`${timePeriod}T00:00:00.000Z`);
   const requestedTime=Date.parse(`${timePeriod}T16:00:00.000Z`);
   if(!Number.isFinite(periodStart)||periodStart>current||!Number.isFinite(requestedTime))continue;
   const publishedMs=Math.min(requestedTime,current);
   if(current-publishedMs>72*60*60*1000)continue;
   const rawValue=attribute(obsAttrs,"OBS_VALUE")??valueById(obs,"OBS_VALUE")??
    tagAttribute(obs,"ObsValue","value")??textValue(obs,"ObsValue")??textValue(obs,"OBS_VALUE");
   const value=Number(rawValue);
   if(rawValue===null||rawValue===""||!Number.isFinite(value))continue;
   const updated=new Date(publishedMs).toISOString();
   entries.push({id:`fed-h10-${timePeriod}-${currency}`,link:FED_H10_ENDPOINT,updated,
    title:`Federal Reserve H.10 exchange rate for ${currency}`,
    summary:"Daily foreign exchange rate observation.",country_iso3,
    reference_statistic:{value:String(value),reference_currency:"USD",counter_currency:currency}});
  }
 }
 return entries;
}

export function standardEntries(xml,now=Date.now()){
 if(typeof xml==="string"&&/<(?:[\w.-]+:)?Series\b/iu.test(xml)&&
  /<(?:[\w.-]+:)?Obs\b/iu.test(xml)){
  const entries=fedH10Entries(xml,now);
  if(entries.length)return entries;
 }
 if(typeof xml==="string"&&/<Cube\b[^>]*\btime=["']\d{4}-\d{2}-\d{2}["']/iu.test(xml)){
  const day=xml.match(/<Cube\b[^>]*\btime=["'](\d{4}-\d{2}-\d{2})["']/iu)?.[1];
  if(!day)return [];
  const rows=[];
  for(const match of xml.matchAll(/<Cube\b([^>]*)\/?\s*>/giu)){
   const attrs=match[1],currency=attrs.match(/\bcurrency=["']([A-Z]{3})["']/iu)?.[1],
    rate=attrs.match(/\brate=["']([0-9]+(?:\.[0-9]+)?)["']/iu)?.[1];
   if(!currency||!rate||!ECB_CURRENCY_COUNTRY[currency])continue;
   rows.push({id:`ecb-euro-reference-${day}-${currency}`,
    link:"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    updated:`${day}T00:00:00.000Z`,title:`ECB euro exchange rate for ${currency}`,
    summary:"Dated ECB euro reference currency rate.",country_iso3:ECB_CURRENCY_COUNTRY[currency],
    reference_statistic:{value:rate,reference_currency:"EUR",counter_currency:currency}});
  }
  return rows;
 }
 if(typeof xml==="string"&&/^[\s]*[\[{]/u.test(xml)){
  try{
   const value=JSON.parse(xml);
   let items=Array.isArray(value)?value:value?.items??value?.entries??value?.data??value?.features??[];
   if(Array.isArray(value)&&value.length===2&&Array.isArray(value[1]))items=value[1];
   if(Array.isArray(items))return items.map(item=>{
    const fields=item?.fields??item?.properties??item??{},date=fields.date;
    const countryRows=Array.isArray(fields.country)?fields.country:Array.isArray(fields.countries)?fields.countries:
     fields.country?[fields.country]:[];
    const countries=[...countryRows.map(row=>hot50Iso3FromValue(typeof row==="string"?row:
     row?.iso3??row?.iso3Code??row?.countryiso3code??row?.iso2??row?.country_code??row?.code??row?.name??row?.value)),
     fields.country_name,fields.countryName,fields.admin0,fields.adm0name,fields.location_country]
      .map(value=>hot50Iso3FromValue(value)).filter(Boolean);
    const rawCountryCode=fields.countryiso3code??fields.country_iso3??fields.iso3??fields.ISO_A3??
     fields.ADM0_A3??fields.country_code??fields.countryCode;
    const countryName=[fields.country_name,fields.countryName,fields.admin0,fields.adm0name,
     fields.location_country,typeof fields.country==="string"?fields.country:null].filter(Boolean).join(" ");
    const countryIso3=hot50Iso3FromValue(rawCountryCode)??hot50Iso3FromValue(countryName)??null;
    let link=String(fields.href??fields.url??fields.external_url??fields.link??fields.url_alias??
     item?.href??item?.url??item?.link??"");
    if(link.startsWith("/"))link="https://reliefweb.int"+link;
    return {id:String(fields.id??fields.uuid??fields.guid??item?.id??item?.guid??""),
     link,
     updated:String(fields.date_modified??fields.date_published??fields.updated??fields.published??
      fields.timestamp??fields.datetime??date?.created??date?.published??date?.original??
      date?.updated??""),
     title:stripMarkup(fields.title??fields.name??""),
     summary:stripMarkup(fields.summary??fields.content_text??fields.description??fields.name??""),
     rights_markers:[fields.rights,fields.license,fields.license_url,fields.copyright,
      ...(Array.isArray(fields.tags)?fields.tags:[])].filter(Boolean).join(" "),
     countries,country_iso3:countryIso3};
   });
  }catch{return []}
 }
 const rows=[];
 for(const match of xml.matchAll(/<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/giu)){
  const block=match[1],value=name=>{
   const rx=new RegExp(`<(?:(?:[\\w.-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${name}\\s*>`,'iu');
   return stripMarkup(block.match(rx)?.[1]??"");
  };
  const links=[...block.matchAll(/<(?:(?:[\w.-]+):)?link\b([^>]*)\/?\s*>/giu)].map(m=>m[1]);
  const link=links.map(attrs=>({href:attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1],
   rel:attrs.match(/\brel=["']([^"']+)["']/iu)?.[1]})).find(x=>x.href&&(!x.rel||x.rel==="alternate"));
  const licenseLinks=links.map(attrs=>({href:attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1],
   rel:attrs.match(/\brel=["']([^"']+)["']/iu)?.[1]})).filter(x=>x.href&&x.rel==="license");
  rows.push({id:value("id")||link?.href,link:link?.href,updated:value("updated")||value("published"),
   title:value("title"),summary:value("summary")||value("description"),
   rights_markers:[value("rights"),value("copyright"),...licenseLinks.map(x=>x.href)].filter(Boolean).join(" ")});
 }
 if(rows.length)return rows;
 for(const match of xml.matchAll(/<(?:[\w.-]+:)?item\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?item\s*>/giu)){
  const attrs=match[1],block=match[2],value=name=>{
   const rx=new RegExp(`<(?:(?:[\\w.-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${name}\\s*>`,'iu');
   return stripMarkup(block.match(rx)?.[1]??"");
  };
  const attr=(name)=>attrs.match(new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}=["']([^"']+)["']`,'iu'))?.[1]??"";
  const licenseLinks=[...block.matchAll(/<(?:(?:[\w.-]+):)?link\b([^>]*)\/?\s*>/giu)].map(m=>m[1])
   .filter(linkAttrs=>/\brel=["']license["']/iu.test(linkAttrs)).map(linkAttrs=>linkAttrs.match(/\bhref=["']([^"']+)["']/iu)?.[1]).filter(Boolean);
  const link=value("link")||attr("about");
  rows.push({id:value("guid")||attr("about")||link,link,updated:value("pubDate")||value("date")||value("issued"),
   title:value("title"),summary:value("description"),
   rights_markers:[value("rights"),value("copyright"),value("license"),...licenseLinks].filter(Boolean).join(" "),
   country_iso3:HOT50_CURRENCY_COUNTRY[value("targetCurrency").toUpperCase()]??null,
   reference_statistic:{value:value("value"),reference_currency:value("baseCurrency"),
    counter_currency:value("targetCurrency")}});
 }
 return rows;
}

function bankOfCanadaEntries(body,now){
 let payload;try{payload=JSON.parse(body)}catch{return []}
 if(!Array.isArray(payload?.observations))return [];
 const eligible=payload.observations.filter(row=>/^\d{4}-\d{2}-\d{2}$/u.test(row?.d??"")&&
  Date.parse(`${row.d}T00:00:00.000Z`)<=now).sort((a,b)=>b.d.localeCompare(a.d));
 const observation=eligible[0];if(!observation)return [];
 const day=observation.d,publishedMs=Math.min(Date.parse(`${day}T16:00:00.000Z`),now);
 if(now-publishedMs>72*60*60*1000)return [];
 const entries=[];
 for(const [key,raw] of Object.entries(observation)){
  const currency=key.match(/^FX([A-Z]{3})CAD$/u)?.[1];
  if(!currency||!ECB_CURRENCY_COUNTRY[currency])continue;
  const value=Number(typeof raw==="object"?raw?.v:raw);
  if(!Number.isFinite(value))continue;
  entries.push({id:`boc-fx-${day}-${currency}`,link:BOC_FX_ENDPOINT,updated:new Date(publishedMs).toISOString(),
   title:`Bank of Canada exchange rate ${currency}`,summary:"Daily foreign exchange rate observation.",
   country_iso3:ECB_CURRENCY_COUNTRY[currency],reference_statistic:{value:String(value),
    reference_currency:"CAD",counter_currency:currency}});
 }
 return entries;
}

function rbaFxEntries(xml,now){
 const rows=standardEntries(xml,now),currencies=Object.keys(ECB_CURRENCY_COUNTRY);
 const aliases={USD:/\b(?:US|U\.S\.|United States) dollar\b/iu,GBP:/\b(?:UK|British|pound sterling)\b/iu,
  JPY:/\bJapanese yen\b/iu,CNY:/\b(?:Chinese|renminbi)\b/iu,INR:/\bIndian rupee\b/iu,
  KRW:/\bSouth Korean won\b/iu,AUD:/\bAustralian dollar\b/iu,CAD:/\bCanadian dollar\b/iu,
  CHF:/\bSwiss franc\b/iu,BRL:/\bBrazilian real\b/iu,MXN:/\bMexican peso\b/iu,
  PLN:/\bPolish zloty\b/iu,SEK:/\bSwedish krona\b/iu,NOK:/\bNorwegian krone\b/iu,
  TRY:/\bTurkish lira\b/iu,ZAR:/\bSouth African rand\b/iu,SGD:/\bSingapore dollar\b/iu,
  MYR:/\bMalaysian ringgit\b/iu,THB:/\bThai baht\b/iu,IDR:/\bIndonesian rupiah\b/iu,
  PHP:/\bPhilippine peso\b/iu};
 return rows.flatMap(row=>{
  const text=`${row.title??""} ${row.summary??""} ${row.link??""}`;
  const codeMatch=text.match(/\b([A-Z]{3})\b/gu)?.find(code=>currencies.includes(code));
  const currency=codeMatch??Object.entries(aliases).find(([,pattern])=>pattern.test(text))?.[0];
  const rawRate=text.match(/(?:^|[^\d])([0-9]+(?:\.[0-9]+)?)(?:[^\d]|$)/u)?.[1];
  const value=Number(rawRate),published=Date.parse(row.updated??"");
  if(!currency||!Number.isFinite(value)||!Number.isFinite(published)||published>now||now-published>72*3600000)return [];
  return [{...row,id:row.id||`rba-fx-${row.updated}-${currency}`,updated:new Date(published).toISOString(),
   title:`Reserve Bank of Australia exchange rate ${currency}`,summary:"Daily foreign exchange rate observation.",
   country_iso3:ECB_CURRENCY_COUNTRY[currency],reference_statistic:{value:String(value),
    reference_currency:"AUD",counter_currency:currency}}];
 });
}
function htmlLicenseEvidence(page,rights,itemUrl){
 const url=rights.rights_evidence.licence_url;
 const licenseId=licenseIdFromRights(rights);
 if(!licenseId)return null;
 if(licenseId==="GDELT_FACTS_ONLY")return null;
 if(licenseId==="ECB_REFERENCE_STATISTICS")return null;
 const escaped=url.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
 const anchor=new RegExp(`<a\\b(?=[^>]*\\brel=["']license["'])(?=[^>]*\\bhref=["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/a\\s*>`,'iu').exec(page)
  ??new RegExp(`<a\\b(?=[^>]*\\bhref=["']${escaped}["'])(?=[^>]*\\brel=["']license["'])[^>]*>([\\s\\S]*?)<\\/a\\s*>`,'iu').exec(page);
 if(!anchor)return null;
 const marker=stripMarkup(anchor[1]);
 if(!marker||marker.length>120)return null;
 if(licenseId==="CC_BY_3.0"&&!/creative commons attribution 3\.0|cc by 3\.0/iu.test(marker))return null;
 // Fail closed on item-level exclusions or restriction markers. Boilerplate
 // OGL terms are not treated as an item exception; only the actual content
 // page is retained for this bounded check.
 const text=stripMarkup(page);
 if(/non[- ]commercial|not for commercial use|all rights reserved|third[- ]party (?:copyright|content|material)|except where otherwise stated[^.]{0,100}(?:this|item|image|content)/iu.test(text))return null;
 return {marker,text:`${marker} ${url} ${rights.rights_evidence.terms_url}`,
  item_url:itemUrl};
}
function licenseIdFromRights(rights){
 const evidence=rights?.rights_evidence;
 if(!evidence||typeof evidence.licence_url!=="string")return null;
 const url=evidence.licence_url;
 if(url==="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/")return "UK_OGL_V3";
 if(url==="https://creativecommons.org/licenses/by/4.0/")return "CC_BY_4.0";
 if(url==="https://creativecommons.org/licenses/by/3.0/")return "CC_BY_3.0";
 if(url==="https://www.usa.gov/government-works")return "US_GOV_PUBLIC_DOMAIN";
 if(url==="https://www.gdeltproject.org/about.html")return "GDELT_FACTS_ONLY";
 if(url==="https://www.ecb.europa.eu/home/html/disclaimer.en.html")return "ECB_REFERENCE_STATISTICS";
 if(url==="https://www.bankofcanada.ca/terms/")return "BANK_OF_CANADA_OGL";
 if(url==="https://www.rba.gov.au/copyright/")return "RBA_CC_BY_4";
 if(url==="https://www.un.org/en/about-us/terms-of-use")return "UN_NEWS_TERMS";
 return null;
}
function publisherOwnedForLicense(licenseId){
 return licenseId==="UK_OGL_V3"||licenseId==="US_GOV_PUBLIC_DOMAIN";
}
function normalizedEntryCandidates(entry,feed,rights,page,feedOrigin="RSS"){
  let category=CATEGORY_BY_FEED[feed.risk_category];
 if(rights.source_id==="gdelt_v2_factual_events"&&
    ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(entry.gdelt_category))
  category=entry.gdelt_category;
 if(!category||!entry.id||!entry.link||!entry.updated)return [];
 let sourceUrl;try{sourceUrl=new URL(entry.link)}catch{return []}
 if(feed.name==="rba_fx_ccby")sourceUrl=new URL("https://www.rba.gov.au/rss/rss-cb-exchange-rates.xml");
 if(sourceUrl.protocol==="http:"&&(sourceUrl.hostname===rights.publisher_root_domain||
  sourceUrl.hostname.endsWith("."+rights.publisher_root_domain)))sourceUrl.protocol="https:";
 if(sourceUrl.protocol!=="https:"||!(sourceUrl.hostname===rights.publisher_root_domain||
  sourceUrl.hostname.endsWith("."+rights.publisher_root_domain)))return [];
 const licenseId=licenseIdFromRights(rights);if(!licenseId)return [];
 const ecbStats=entry.reference_statistic;
 const fedH10=feed.name==="us_fed_h10_public_domain"&&Boolean(ecbStats);
 if(licenseId==="ECB_REFERENCE_STATISTICS"&&(!ecbStats||!Number.isFinite(Number(ecbStats.value))||
  !ecbStats.reference_currency||!ecbStats.counter_currency))return [];
 if(fedH10&&(!Number.isFinite(Number(ecbStats.value))||!ecbStats.reference_currency||
  !ecbStats.counter_currency))return [];
 const gdeltFacts=entry.gdelt_facts;
 const referenceFx=["BANK_OF_CANADA_OGL","RBA_CC_BY_4"].includes(licenseId)&&Boolean(entry.reference_statistic);
 const unNews=licenseId==="UN_NEWS_TERMS";
 if(referenceFx&&(!Number.isFinite(Number(entry.reference_statistic.value))||
  !entry.reference_statistic.reference_currency||!entry.reference_statistic.counter_currency))return [];
 const evidence=licenseId==="ECB_REFERENCE_STATISTICS"?
  {marker:"ECB reference statistics, values unmodified"}:fedH10?
   {marker:"Federal Reserve H.10 public-domain exchange-rate observation"}:
   licenseId==="GDELT_FACTS_ONLY"&&gdeltFacts?
   {marker:"GDELT factual event metadata only"}:licenseId==="BANK_OF_CANADA_OGL"&&referenceFx?
   {marker:"Bank of Canada factual FX observation only"}:licenseId==="RBA_CC_BY_4"&&referenceFx?
   {marker:"Reserve Bank of Australia factual FX observation only"}:unNews?
   {marker:"UN News factual metadata only; no article text republished"}:htmlLicenseEvidence(page,rights,sourceUrl.href);
 if(!evidence)return [];
 const itemRights=String(entry.rights_markers??"");
 if(/non[- ]commercial|not for commercial use|all rights reserved|third[- ]party|third party|restricted|no derivatives|\bcc[- ]?by[- ]?nc\b/iu.test(itemRights))return [];
 const declaredLicenses=[...itemRights.matchAll(/https:\/\/[^\s<>"']+/giu)].map(x=>x[0].replace(/[),.;]+$/u,""));
 if(declaredLicenses.some(url=>url!==rights.rights_evidence.licence_url&&url!==rights.rights_evidence.terms_url))return [];
 const corpus=`${entry.title} ${entry.summary} ${entry.text??""} ${entry.content??""} ${entry.content_text??""}`.toLowerCase();
 if(["un_news_org_rss","global_voices_original_cc_by_3"].includes(rights.source_id)){
  if(CRITICAL_MINERAL_SUPPLY_TERMS.test(corpus))category="CRITICAL_MINERALS";
  else if(MACRO_FX_TERMS.test(corpus))category="MACRO_FX";
 }
 const eventType=licenseId==="GDELT_FACTS_ONLY"&&gdeltFacts?
  gdeltFacts.event_type:
  CATEGORY_TERMS[category].find(([rx,type])=>rx.test(corpus)&&
   (category!=="CRITICAL_MINERALS"||CRITICAL_MINERAL_SUPPLY_TERMS.test(corpus)))?.[1];
 if(!eventType)return [];
 const countries=matchHot50Countries(entry,corpus,rights.source_id,
  category==="CRITICAL_MINERALS"?6:3);
 if(!countries.length)return [];
 const published=new Date(entry.updated);
 if(!Number.isFinite(published.getTime()))return [];
 const published_at=published.toISOString();
 const corridor=STRATEGIC_CORRIDORS.find(([pattern])=>pattern.test(corpus))?.[1]??null;
 const theme=SIGNAL_THEMES.find(([pattern])=>pattern.test(corpus))?.[1]??null;
 return countries.map(country_iso3=>{
  const gdeltFactsOnly=licenseId==="GDELT_FACTS_ONLY";
  const event_identity={country_iso3,event_type:eventType,
   actor_id:gdeltFactsOnly?rights.parent_media_entity:`${country_iso3.toLowerCase()}_${eventType}`,
   target_id:gdeltFactsOnly?"gdelt_event_"+gdeltFacts.global_event_id:
    country_iso3.toLowerCase()+"_policy_subject",location_id:country_iso3.toLowerCase()+"_national_scope",
   occurred_at:gdeltFactsOnly?published_at:`${published_at.slice(0,10)}T00:00:00.000Z`};
  const raw_payload=licenseId==="GDELT_FACTS_ONLY"?JSON.stringify({
   schema:"geomacro.gdelt.factual-event.v1",license_notice_url:rights.rights_evidence.licence_url,
   license_marker:evidence.marker,global_event_id:gdeltFacts.global_event_id,sql_date:gdeltFacts.sql_date,
   actor1_code:gdeltFacts.actor1_code,actor2_code:gdeltFacts.actor2_code,event_code:gdeltFacts.event_code,
   goldstein_scale:gdeltFacts.goldstein_scale===""?null:Number(gdeltFacts.goldstein_scale),country_iso3,
   published_at,source_url:sourceUrl.href}):fedH10?JSON.stringify({
   schema:"geomacro.federal-reserve.h10-reference-statistic.v1",
   license_notice_url:rights.rights_evidence.licence_url,license_marker:evidence.marker,
   series_key:`${ecbStats.reference_currency}/${ecbStats.counter_currency}`,
   observed_at:entry.updated,published_at,value:Number(ecbStats.value),
   unit:`${ecbStats.counter_currency} per ${ecbStats.reference_currency}`,
   reference_currency:ecbStats.reference_currency,counter_currency:ecbStats.counter_currency}):
   licenseId==="BANK_OF_CANADA_OGL"?JSON.stringify({schema:"geomacro.boc.fx-rate.v1",
    license_notice_url:rights.rights_evidence.licence_url,license_marker:evidence.marker,
    observed_at:entry.updated,published_at,country_iso3,currency:ecbStats.counter_currency,
    reference_currency:ecbStats.reference_currency,value:Number(ecbStats.value)}):
   licenseId==="RBA_CC_BY_4"?JSON.stringify({schema:"geomacro.rba.fx-rate.v1",
    license_notice_url:rights.rights_evidence.licence_url,license_marker:evidence.marker,
    observed_at:entry.updated,published_at,country_iso3,currency:ecbStats.counter_currency,
    reference_currency:ecbStats.reference_currency,value:Number(ecbStats.value)}):
   unNews?JSON.stringify({schema:"geomacro.un-news.factual-record.v1",
    license_notice_url:rights.rights_evidence.licence_url,license_marker:evidence.marker,
    record_id:String(entry.id),published_at,country_iso3,category,event_type:eventType,
    item_url:sourceUrl.href}):
   rights.source_id==="global_voices_original_cc_by_3"?JSON.stringify({
    schema:"geomacro.global-voices.factual-record.v1",
    license_notice_url:rights.rights_evidence.licence_url,license_marker:evidence.marker,
    record_id:String(entry.id).slice(0,256),published_at,country_iso3,category,event_type:eventType,
    item_url:sourceUrl.href}):
   licenseId==="ECB_REFERENCE_STATISTICS"?JSON.stringify({
   schema:"geomacro.ecb.reference-statistic.v1",license_notice_url:rights.rights_evidence.licence_url,
   license_marker:evidence.marker,series_key:`${ecbStats.reference_currency}/${ecbStats.counter_currency}`,
   observed_at:entry.updated,published_at,value:Number(ecbStats.value),
   unit:`${ecbStats.counter_currency} per ${ecbStats.reference_currency}`,
   reference_currency:ecbStats.reference_currency,counter_currency:ecbStats.counter_currency}):
   JSON.stringify({id:entry.id,link:sourceUrl.href,updated:entry.updated,
    country_iso3,category,license_marker:evidence.marker,license_url:rights.rights_evidence.licence_url,
    terms_url:rights.rights_evidence.terms_url});
  const derived=buildDerivedSignal({theme,country:country_iso3,corridor,corpus,category,eventType});
  const original={schema:"geomacro.risk-stream-original.v1",kind:"VERIFIED_ORIGINAL",country_iso3,
   category,feed_origin:feedOrigin,source_id:rights.source_id,source_role:rights.source_role,
   publisher_root_domain:rights.publisher_root_domain,parent_media_entity:rights.parent_media_entity,
   source_url:sourceUrl.href,published_at,event_identity,raw_payload,
   reporting_position:"confirms",
   item_license_evidence:{license_id:licenseId,license_url:rights.rights_evidence.licence_url,
    terms_url:rights.rights_evidence.terms_url,item_url:sourceUrl.href,item_license_marker:evidence.marker,
    publisher_owned_content_only:publisherOwnedForLicense(licenseId),third_party_exceptions:false,non_commercial:false,
    restricted_material:false,factual_record_only:true,original_text_republished:false},
   derived};
  return {...original,...eventIdentityFields(original)};
 });
}

function load(){
 const rights=JSON.parse(readFileSync(RIGHTS_PATH,"utf8"));
 const feeds=JSON.parse(readFileSync(FEEDS_PATH,"utf8"));
 const officialAtom=JSON.parse(readFileSync("config/official-ogl-atom-sources.json","utf8"));
 if(rights.schema!=="geomacro.risk-stream-source-rights-reviewed.v1"||
    !Array.isArray(rights.entries)||feeds.schema!=="geomacro.unified-rss-feed-registry.v1"||
    !Array.isArray(feeds.sources)||officialAtom.schema!=="geomacro.official-free-atom-license-registry.v1"||
    !Array.isArray(officialAtom.sources))fail("REGISTRY_INVALID");
 return {rights,feeds,officialAtom};
}

/**
 * Keep the reviewed rights manifest as the only source-approval authority.
 * The dedicated official OGL inventory is a fallback endpoint catalog for
 * approved UK Atom feeds when a feed is absent from the broader RSS catalog.
 * Its license and terms references must match the reviewed row exactly.
 */
export function reviewedFeedSources({rightsManifest,feeds,officialAtomSources=[]}={}){
 if(!Array.isArray(rightsManifest?.entries)||!Array.isArray(feeds?.sources)||
    !Array.isArray(officialAtomSources))fail("REGISTRY_INVALID");
 const approved=new Map(rightsManifest.entries.filter(row=>row.status==="APPROVED")
  .map(row=>[row.source_id,row]));
 const byId=new Map(feeds.sources.filter(row=>typeof row?.name==="string")
  .map(row=>[row.name,row]));
 for(const row of officialAtomSources){
  const sourceId=row?.source_id,rights=approved.get(sourceId);
  if(!rights||byId.has(sourceId)||row.ingest_transport!=="DIRECT_OFFICIAL_ATOM"||
     row.telegram_content_license!==false||row.license!==rights.rights_evidence?.licence_url||
     row.rights_reference!==rights.rights_evidence?.terms_url||
     !Array.isArray(rights.categories)||!rights.categories.includes(row.category))continue;
  let url;try{url=new URL(row.feed_url)}catch{continue}
  if(url.protocol!=="https:"||!(url.hostname===rights.publisher_root_domain||
     url.hostname.endsWith("."+rights.publisher_root_domain)))continue;
  const category=RISK_CATEGORY_BY_RIGHTS[row.category];if(!category)continue;
  byId.set(sourceId,{name:sourceId,url:url.href,source_type:"official",risk_category:category,
   risk_stream_item_licensed:true,risk_stream_standard_item_license_candidate:true});
 }
 return [...byId.values()];
}

/** Read only approved, opt-in feeds; discard metadata-only entries before emitting JSONL. */
export async function collectRiskStreamFeedExtensions({collector="direct",now=Date.now(),
 fetchImpl=fetch,rightsManifest,feeds,officialAtomSources,sourceRegistry,radarSignals=[]}={}){
 if(!["direct","private","render"].includes(collector))fail("COLLECTOR_INVALID");
 const disk=rightsManifest&&feeds?null:load();
 const loaded={rights:rightsManifest??disk.rights,feeds:feeds??disk.feeds,
  officialAtom:officialAtomSources??disk?.officialAtom};
 const manifest=loaded.rights,registry=loaded.feeds;
 const reviewedSources=reviewedFeedSources({rightsManifest:manifest,feeds:registry,
  officialAtomSources:Array.isArray(loaded.officialAtom)?loaded.officialAtom:
   loaded.officialAtom?.sources??[]});
 const approved=new Map(manifest.entries.filter(row=>row.status==="APPROVED")
  .map(row=>[row.source_id,row]));
 const sources=sourceRegistry??manifest.entries.map(row=>({...row,enabled:1,commercial_rights_approved:1}));
 const priority=prioritizeApprovedAnchorSources(radarSignals,reviewedSources.map(feed=>{
  const rights=approved.get(feed.name);
  const sourceRow=sources.find(row=>(row.source_id??row.name)===feed.name);
  const country_iso3=SOURCE_COUNTRY[feed.name]??null;
  return {...feed,source_id:feed.name,
   categories:[CATEGORY_BY_FEED[feed.risk_category]].filter(Boolean),
   country_iso3,global:true,
   enabled:feed.risk_stream_item_licensed===true&&
    feed.risk_stream_standard_item_license_candidate===true&&sourceRow?.enabled===1?1:0,
   commercial_rights_approved:rights&&sourceRow?.commercial_rights_approved===1?1:0};
 }));
 const orderedFeeds=priority.sources;
 const originals=[],counts={feeds_checked:0,extensions_seen:0,
  standard_entries_seen:0,standard_candidates_built:0,feeds_without_candidate_extension:0,invalid:0,
  stale_entries_skipped:0,future_entries_skipped:0,undated_entries_skipped:0,invalid_by_code:{}};
 let structuredCandidatesEmitted=0;
 for(const feed of orderedFeeds){
  if(feed.risk_stream_item_licensed!==true||
     feed.risk_stream_standard_item_license_candidate!==true)continue;
  const rights=approved.get(feed.name);
  if(!rights)continue;
  let url;try{url=new URL(feed.url)}catch{continue}
  if(feed.name==="un_reliefweb_api_ccby"){const rwApp=String(process.env.RELIEFWEB_APPROVED_APPNAME??"").trim();if(rwApp)url.searchParams.set("appname",rwApp);}
  if(url.protocol!=="https:"||!(url.hostname===rights.publisher_root_domain||
     url.hostname.endsWith("."+rights.publisher_root_domain)))continue;
  counts.feeds_checked++;
  let response;
  try{response=await fetchImpl(url.href,{method:"GET",redirect:"error",
   signal:AbortSignal.timeout(15_000),
   headers:{Accept:"application/atom+xml, application/rss+xml, application/xml, application/feed+json, application/json"}})}
  catch{continue}
  if(!response?.ok)continue;
  let body;try{body=await boundedText(response)}catch{continue}
  let extensions;try{extensions=extractRiskStreamFeedExtensions(body)}catch{counts.invalid++;continue}
  if(extensions.length===0)counts.feeds_without_candidate_extension++;
  let standard,feedOrigin;
  if(feed.name==="gdelt_v2_factual_events"){
   const archiveName=body.match(/(?:^|\s|\/)([\w.-]+\.export\.CSV\.zip)(?:\s|$)/iu)?.[1];
   if(!archiveName)continue;
   const archiveUrl=new URL(`https://data.gdeltproject.org/gdeltv2/${archiveName}`);
   if(archiveUrl.protocol!=="https:"||archiveUrl.hostname!=="data.gdeltproject.org")continue;
   let archiveResponse,archive;
   try{archiveResponse=await fetchImpl(archiveUrl.href,{method:"GET",redirect:"error",
    signal:AbortSignal.timeout(15_000),headers:{Accept:"application/zip, application/octet-stream"}});
    if(!archiveResponse?.ok)continue;
    archive=unzipSingleDeflateEntry(await boundedBytes(archiveResponse));}
   catch{continue}
   standard=gdeltEventEntries(archive,archiveUrl.href,now);
   feedOrigin="OFFICIAL_API";
  }else if(feed.name==="bank_of_canada_fx_ogl"){
   standard=bankOfCanadaEntries(body,now);feedOrigin="OFFICIAL_API";
  }else if(feed.name==="rba_fx_ccby"){
   standard=rbaFxEntries(body,now);feedOrigin="RSS";
  }else{
   standard=standardEntries(body,now);
   feedOrigin=/json/iu.test(response.headers?.get?.("content-type")??"")||/^[\s]*[\[{]/u.test(body)?"OFFICIAL_API":"RSS";
  }
  const structuredCandidateFeed=feedOrigin==="OFFICIAL_API"||
   ["GDELT_FACTS_ONLY","ECB_REFERENCE_STATISTICS"].includes(licenseIdFromRights(rights))||
   ["BANK_OF_CANADA_OGL","RBA_CC_BY_4","UN_NEWS_TERMS"].includes(licenseIdFromRights(rights))||
   feed.name==="us_fed_h10_public_domain";
  const current=standard.filter(entry=>{
   const published=Date.parse(entry?.updated??"");
   if(!Number.isFinite(published)){counts.undated_entries_skipped++;return false}
   if(published>now){counts.future_entries_skipped++;return false}
   if(now-published>72*60*60*1000){counts.stale_entries_skipped++;return false}
   return true;
  }).slice(0,structuredCandidateFeed?MAX_STRUCTURED_FEED_CANDIDATES:MAX_HTML_PAGE_FETCHES_PER_FEED);
  let htmlPageFetches=0;
  const built=await Promise.all(current.map(async entry=>{
   counts.standard_entries_seen++;
   let page="";
   if(!["ECB_REFERENCE_STATISTICS","GDELT_FACTS_ONLY","BANK_OF_CANADA_OGL","RBA_CC_BY_4","UN_NEWS_TERMS"].includes(licenseIdFromRights(rights))&&
      feed.name!=="us_fed_h10_public_domain"){
    if(htmlPageFetches>=MAX_HTML_PAGE_FETCHES_PER_FEED)return [];
    htmlPageFetches++;
    let itemUrl;try{itemUrl=new URL(entry.link)}catch{return []}
    if(itemUrl.protocol==="http:"&&(itemUrl.hostname===rights.publisher_root_domain||
     itemUrl.hostname.endsWith("."+rights.publisher_root_domain)))itemUrl.protocol="https:";
    try{const pageResponse=await fetchImpl(itemUrl.href,{method:"GET",redirect:"error",
     signal:AbortSignal.timeout(15_000),headers:{Accept:"text/html"}});
     if(!pageResponse?.ok)return [];page=await boundedText(pageResponse);
    }catch{return []}
   }
   const candidates=normalizedEntryCandidates(entry,feed,rights,page,feedOrigin);if(!candidates.length)return [];
   const accepted=[];
   for(const original of candidates){
    counts.standard_candidates_built++;
    try{prepareRiskStreamCandidate(original,sources,now,{rightsManifest:manifest});accepted.push(original)}
    catch(error){counts.invalid++;const code=String(error?.message??"INVALID").slice(0,100);
     counts.invalid_by_code[code]=(counts.invalid_by_code[code]??0)+1}
   }
   return accepted;
  }));
  const structuredCandidateBudget=Math.max(0,MAX_STRUCTURED_FEED_CANDIDATES-structuredCandidatesEmitted);
  const standardCandidates=built.flat().slice(0,structuredCandidateFeed?
   structuredCandidateBudget:MAX_HTML_PAGE_FETCHES_PER_FEED);
  originals.push(...standardCandidates);
  if(structuredCandidateFeed)structuredCandidatesEmitted+=standardCandidates.length;
  for(const original of extensions){
   if(structuredCandidateFeed&&structuredCandidatesEmitted>=MAX_STRUCTURED_FEED_CANDIDATES)break;
   counts.extensions_seen++;
   if(original.source_id!==feed.name||original.feed_origin!=="RSS"||
      CATEGORY_BY_FEED[feed.risk_category]!==original.category){
    counts.invalid++;continue;
   }
   try{
    const normalized=original.country_iso3==="ATA"?{...original,country_iso3:"AUS",
     event_identity:{...original.event_identity,country_iso3:"AUS"}}:original;
    const candidate={...normalized,...eventIdentityFields(normalized)};
    prepareRiskStreamCandidate(candidate,sources,now,{rightsManifest:manifest});
    originals.push(candidate);if(structuredCandidateFeed)structuredCandidatesEmitted++;
   }catch{counts.invalid++;}
  }
 }
 return {schema:"geomacro.risk-stream-collector-candidate-sidecar.v1",collector,
  status:originals.length?"ITEM_LICENSE_VERIFIED_CANDIDATES_READY":"NO_ITEM_LICENSE_VERIFIED_CANDIDATES",
  originals,counts,lane_b_redacted_signals:radarSignals.length,
  lane_a_priority_sources:priority.prioritized_count,
  lane_a_priority_source_ids:priority.prioritized_source_ids};
}

async function main(){
 const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]??null};
 const collector=value("--collector"),output=value("--output"),radarFile=value("--radar-file");
 if(!collector||!output)fail("COLLECTOR_AND_OUTPUT_REQUIRED");
 let radarSignals=[];
 if(radarFile){
  const temp=resolve(String(process.env.RUNNER_TEMP??"/never"));
  const path=resolve(radarFile);
  if(!path.startsWith(temp+sep))fail("RADAR_PATH_INVALID");
  const radar=JSON.parse(readFileSync(path,"utf8"));
  if(radar?.schema!=="geomacro.rights-redacted-speed-radar-batch.v1"||
     !Array.isArray(radar.signals))fail("RADAR_BATCH_INVALID");
  radarSignals=radar.signals;
 }
 const result=await collectRiskStreamFeedExtensions({collector,radarSignals});
 writeFileSync(output,result.originals.map(row=>JSON.stringify(row)).join("\n")+
  (result.originals.length?"\n":""),{encoding:"utf8",mode:0o600,flag:"w"});
 const {originals,...receipt}=result;
 console.log(JSON.stringify({...receipt,candidate_count:originals.length,raw_payloads_logged:false}));
}
if(import.meta.url===new URL(process.argv[1],"file:").href)
 main().catch(error=>{console.error(String(error?.message??"RISK_STREAM_FEED_EXTENSION_FAILED").slice(0,120));process.exitCode=2});

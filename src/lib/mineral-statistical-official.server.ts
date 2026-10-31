/**
 * Bounded first-party USGS MCS 2026 + UN Comtrade lookup.
 * Annual statistical observations are never current news, event verification,
 * charge permission, mining-absence proof or a signed response.
 */
import {createHash} from "node:crypto";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import type {MineralStatisticalObservation} from "./mineral-statistical-baseline";

const RELEASE="https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release";
const COMTRADE="https://comtradeapi.un.org/";
const USGS_DOWNLOADS=Object.freeze([
 "https://www.sciencebase.gov/catalog/file/get/69837e43b66b01367d7ec7c7/MCS2026_Commodities_Data.csv",
 "https://www.sciencebase.gov/catalog/file/get/696a75d5d4be0228872d3bf8/MCS2026_Commodities_Data.csv"
]);
const FILE_SHA="582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5";
const REPORTERS="https://comtradeapi.un.org/files/v1/app/reference/Reporters.json";
const COMMODITY=new Map([
 ["lithium","lithium"],["cobalt","cobalt"],["copper","copper"],
 ["nickel","nickel"],["graphite","graphite"],["rare earth","rare_earths"],
]);
const ORES:Readonly<Record<string,string>>={cobalt:"260500",copper:"260300",nickel:"260400"};
type Fetcher=typeof fetch;
const validCountry=(iso3:string)=>COUNTRIES_195.some(c=>c.iso3===iso3);
function validateResponse(res:Response,max:number) {
 if(res.status!==200||res.redirected||res.headers.get("content-length")&&
   Number(res.headers.get("content-length"))>max)throw Error("OFFICIAL_STATISTICAL_PROVIDER_UNAVAILABLE");
}
async function bounded(url:string,fetchImpl:Fetcher,max:number,accept:string){
 const res=await fetchImpl(url,{redirect:"error",headers:{accept},signal:AbortSignal.timeout(9000)});
 validateResponse(res,max);
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.byteLength>max)throw Error("OFFICIAL_STATISTICAL_RESPONSE_OVERSIZE");
 return bytes;
}
function rowsCsv(bytes:Uint8Array){
 // The MCS release is Windows-1252; preserving accented country names matters.
 const text=new TextDecoder("windows-1252",{fatal:true}).decode(bytes);
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;continue;}
  if(!quoted&&c===","){row.push(field);field="";continue;}
  if(!quoted&&(c==="\n"||c==="\r")){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row.push(field);field="";if(row.some(x=>x.trim()))rows.push(row);row=[];continue;
  }
  field+=c;
 }
 if(quoted)throw Error("USGS_CSV_INVALID");
 if(field||row.length){row.push(field);rows.push(row);}
 const heads=rows.shift()?.map(x=>x.trim().replace(/^\uFEFF/u,""))??[];
 const required=["Country","Commodity","Year","Statistics","Unit","Value"];
 if(!required.every(x=>heads.includes(x))||rows.length>100_000)throw Error("USGS_CSV_COLUMNS_INVALID");
 return rows.map(values=>Object.fromEntries(heads.map((h,i)=>[h,(values[i]??"").trim()])));
}
function countryOf(label:string){
 const normal=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"").trim();
 const x=normal(label);
 return COUNTRIES_195.find(c=>normal(c.iso3)===x||normal(c.name)===x||
   c.aliases.some(a=>normal(a)===x))?.iso3??null;
}
function usgsScope(rows:Record<string,string>[],iso3:string,commodity:string){
 const matched=rows.flatMap(row=>{
  if(countryOf(row.Country)!==iso3)return [];
  const material=row.Commodity.toLowerCase().replace(/[-_]/gu," ").trim();
  if(!(material===commodity||material===commodity+"s"||
    commodity==="rare_earths"&&/rare.?earth/u.test(material)))return [];
  const statistic=[row.Statistics,row.Statistics_detail??""].join(" ").toLowerCase();
  // Only actual mine output, not smelter output, refinery production, or
  // country mineral reserves. Never infer absence from a missing row.
  if(!/(?:mine production|mine output|production of mines)/u.test(statistic)||
    /(?:refin|smelt|plant|capacity|reserve|import|export)/u.test(statistic))return [];
  const yr=Number(row.Year), value=Number(row.Value.replace(/,/gu,""));
  if(!Number.isSafeInteger(yr)||yr<2000||yr>2026||
    !Number.isFinite(value)||value<0)return [];
  const unit=row.Unit.toLowerCase().replace(/\s+/gu," ").trim();
  const u=/^metric (?:tons?|tonnes?)$/u.test(unit)?"metric_tonnes":
    /^(?:tons?|tonnes?)$/u.test(unit)?"tonnes":
    /^kilograms?$/u.test(unit)?"kilograms":
    /^thousand metric (?:tons?|tonnes?)$/u.test(unit)?"thousand_metric_tonnes":null;
  if(!u)return [];
  return [{source:"USGS_MCS_2026" as const,country_iso3:iso3,
    commodity,reference_year:yr,metric:"MINE_PRODUCTION" as const,
    value,unit:u,dataset_url:RELEASE,period_verified:true as const,
    country_mapping_verified:true as const,commodity_mapping_verified:true as const}];
 });
 return matched.sort((a,b)=>b.reference_year-a.reference_year).slice(0,3);
}
async function usgs(iso3:string,commodity:string,fetchImpl:Fetcher){
 // Pinned fixed official endpoints, NEVER follow a URL obtained from provider
 // metadata. This prevents origin/path injection as well as extra redirects.
 for(const url of USGS_DOWNLOADS){
  try{
   const bytes=await bounded(url,fetchImpl,8*1024*1024,"text/csv");
   if(createHash("sha256").update(bytes).digest("hex")!==FILE_SHA)continue;
   return usgsScope(rowsCsv(bytes),iso3,commodity);
  }catch{/* Try the second already-pinned ScienceBase item only. */}
 }
 return [];
}
function reporterCode(body:unknown,iso3:string){
 const records=(body as {results?:unknown})?.results;
 if(!Array.isArray(records))return null;
 const code=records.find(x=>
   x?.reporterCodeIsoAlpha3===iso3&&x?.isGroup!==true&&!x?.entryExpiredDate)?.reporterCode;
 return Number.isSafeInteger(Number(code))&&Number(code)>0&&Number(code)<=999?Number(code):null;
}
async function comtrade(iso3:string,commodity:string,fetchImpl:Fetcher,year:number){
 const hs=ORES[commodity];if(!hs)return [];
 const data=JSON.parse(new TextDecoder().decode(await bounded(REPORTERS,fetchImpl,512*1024,"application/json")));
 const reporter=reporterCode(data,iso3);if(!reporter)return [];
 const rows:MineralStatisticalObservation[]=[];
 for(const [flow,metric] of [["M","IMPORT_VALUE"],["X","EXPORT_VALUE"]] as const){
  const q=new URL("https://comtradeapi.un.org/public/v1/preview/C/A/HS");
  for(const [k,v] of Object.entries({reporterCode:String(reporter),period:String(year),
    cmdCode:hs,flowCode:flow,partnerCode:"0",maxRecords:"25"}))q.searchParams.set(k,v);
  let result:unknown;
  try{result=JSON.parse(new TextDecoder().decode(await bounded(q.toString(),fetchImpl,1024*1024,"application/json")));}
  catch{return rows;} // Fail closed, do not invent missing flow values.
  const values=(result as {data?:unknown})?.data;
  if(!Array.isArray(values)||values.length!==1)continue;
  const item=values[0];
  if(Number(item.reporterCode)!==reporter||String(item.period)!==String(year)||
     String(item.cmdCode)!==hs||String(item.flowCode).toUpperCase()!==flow||
     String(item.partnerCode)!=="0")continue;
  const value=Number(item.primaryValue);
  if(!Number.isFinite(value)||value<0)continue;
  rows.push({source:"UN_COMTRADE",country_iso3:iso3,commodity,reference_year:year,
   metric,value,unit:"usd",dataset_url:COMTRADE,period_verified:true,
   country_mapping_verified:true,commodity_mapping_verified:true});
 }
 return rows;
}
export async function fetchOfficialMineralStatisticalObservations(input:{
 country_iso3:string;mineral:string;now?:Date;fetchImpl?:Fetcher;
}):Promise<readonly MineralStatisticalObservation[]> {
 const commodity=COMMODITY.get(input.mineral),iso3=input.country_iso3;
 if(!commodity||!validCountry(iso3))return [];
 const now=input.now??new Date();if(!Number.isFinite(now.getTime()))return [];
 const fetchImpl=input.fetchImpl??fetch;
 // One official USGS CSV (2026 release) + at most one reporter reference and
 // two Comtrade no-key annual preview queries. Never query arbitrary URLs.
 const [a,b]=await Promise.allSettled([
   usgs(iso3,commodity,fetchImpl),
   comtrade(iso3,commodity,fetchImpl,now.getUTCFullYear()-1),
 ]);
 return [...(a.status==="fulfilled"?a.value:[]),
   ...(b.status==="fulfilled"?b.value:[])];
}

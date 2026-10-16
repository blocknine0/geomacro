import {COUNTRIES_195} from "./canonical-country-registry-195";
import {readGdeltStaticArchive,limitedGdeltBody} from "../../scripts/lib/gdelt-gkg-bulk-discovery.mjs";

const LOOKUP="https://gdeltproject.org/data/lookups/FIPS.country.txt";
const normalize=(s:string)=>s.normalize("NFKD").replace(/\p{Diacritic}/gu,"").trim().toLowerCase();
const extra:Record<string,string>={"Bahamas, The":"BHS","Bosnia-Herzegovina":"BIH","Congo":"COG",
  "Democratic Republic of the Congo":"COD","Cote dIvoire":"CIV","Gambia, The":"GMB",
  "Korea, North":"PRK","North Korea":"PRK","Korea, South":"KOR","South Korea":"KOR",
  "Vietnam, Democratic Republic of":"VNM"};
const names=new Map(COUNTRIES_195.flatMap(c=>[c.name,...c.aliases].map(n=>[normalize(n),c.iso3])));
for(const [name,iso3] of Object.entries(extra))names.set(normalize(name),iso3);
export function parseGdeltFipsCountries(text:string){
  if(typeof text!=="string"||Buffer.byteLength(text)>64_000)throw Error("GDELT_FIPS_LOOKUP_INVALID");
  const fips=new Map<string,string>();
  for(const line of text.split(/\r?\n/)){
    const [code,...parts]=line.split("\t");const name=parts.join("\t").trim();
    if(/^[A-Z]{2}$/.test(code??"")&&name){
      if(fips.has(code))throw Error("GDELT_FIPS_LOOKUP_DUPLICATE");
      fips.set(code,name);
    }
  }
  if(fips.size<200||fips.size>400)throw Error("GDELT_FIPS_LOOKUP_INVALID");
  return new Map([...fips].map(([code,name])=>[code,names.get(normalize(name))??null]));
}
export function summarizeGdeltEventDiscovery(text:string,fips:Map<string,string|null>,batchAt:string,now=new Date()){
  const batch=Date.parse(batchAt),at=now.getTime();
  if(!Number.isFinite(batch)||batch>at||at-batch>60*60_000||typeof text!=="string"||Buffer.byteLength(text)>64*1024*1024)
    throw Error("GDELT_EVENT_BATCH_INVALID");
  let scanned=0,malformed=0,conflict=0,unmapped=0;const seen=new Set<string>(),countryCounts=new Map<string,number>();
  for(const line of text.split(/\r?\n/)){
    if(!line)continue;if(++scanned>100_000)throw Error("GDELT_EVENT_ROW_BOUND_EXCEEDED");
    const f=line.split("\t");
    if(f.length!==61||!/^\d{1,20}$/.test(f[0])||!/^\d{8}$/.test(f[1])){malformed++;continue;}
    const eventDay=f[1].slice(0,4)+"-"+f[1].slice(4,6)+"-"+f[1].slice(6,8);
    if(!Number.isFinite(Date.parse(eventDay))||new Date(eventDay).toISOString().slice(0,10)!==eventDay||Date.parse(eventDay)>at){malformed++;continue;}
    if(!["13","14","15","16","17","18","19","20"].includes(f[28]))continue;
    if(seen.has(f[0]))continue;seen.add(f[0]);conflict++;
    const iso3=fips.get(f[53]);if(!iso3){unmapped++;continue;}
    countryCounts.set(iso3,(countryCounts.get(iso3)??0)+1);
  }
  if(scanned===0||malformed===scanned)throw Error("GDELT_EVENT_NO_VALID_ROWS");
  return {schema:"geomacro.gdelt-event-d1-discovery.v1",status:"STATIC_EVENT_BATCH_READ",
    checked_at:now.toISOString(),upstream_batch_at:batchAt,rows_scanned:scanned,malformed_rows:malformed,
    conflict_root_rows:conflict,unmapped_conflict_rows:unmapped,
    country_counts:[...countryCounts].sort(([a],[b])=>a.localeCompare(b)).map(([country_iso3,indexed_records])=>({country_iso3,indexed_records})),
    clock_semantics:"GDELT_INDEX_BATCH_NOT_ORIGINAL_PUBLICATION",original_news_freshness_verified:false,
    independent_event_verified:false,rights_verified:false,scored:false,chargeable:false,
    raw_records_persisted:false,source_urls_exposed:false,supabase_requests:0,b2_requests:0,payments:0};
}
export async function readGdeltEventDiscovery({fetchImpl=fetch,now=new Date()}={}){
  try{
    const request=async(url:string,max:number)=>{
      const r=await fetchImpl(url,{redirect:"error",headers:{Accept:"*/*"},signal:AbortSignal.timeout(20_000)});
      if(!r.ok)throw Error("GDELT_EVENT_HTTP_"+r.status);
      return limitedGdeltBody(r,max);
    };
    const {manifest,manifest_route,decoded:text}=await readGdeltStaticArchive({fetchImpl,now,kind:"events"});
    if(now.getTime()-Date.parse(manifest.batch_at)>60*60_000)throw Error("GDELT_EVENT_BATCH_INVALID");
    const fips=parseGdeltFipsCountries((await request(LOOKUP,64000)).toString("utf8"));
    return {...summarizeGdeltEventDiscovery(text,fips,manifest.batch_at,now),archive_integrity_verified:true,manifest_route};
  }catch(error){
    const message=error instanceof Error?error.message:"";
    return {schema:"geomacro.gdelt-event-d1-discovery.v1",status:"GDELT_EVENT_DEGRADED",checked_at:now.toISOString(),
      reason:/^(?:GDELT_(?:EVENT|FIPS)|GKG)_[A-Z0-9_]+$/.test(message)?message:"GDELT_EVENT_TRANSPORT_OR_FORMAT_UNAVAILABLE",
      archive_integrity_verified:false,original_news_freshness_verified:false,independent_event_verified:false,
      scored:false,chargeable:false,raw_records_persisted:false,source_urls_exposed:false,supabase_requests:0,b2_requests:0,payments:0};
  }
}

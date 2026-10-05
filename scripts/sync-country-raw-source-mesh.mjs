import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./ops/b2-s3-client.mjs";

const REF="ldpwajisioljyjtojvfx", SOURCE="country_raw_web_mesh", BUCKET="geomacro-live-intelligence";
const B2_BUCKET="geomacro-private-archive", B2_ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const ARCHIVE_MODE=String(process.env.RAW_SOURCE_ARCHIVE_MODE??(String(process.env.GRI_DB_MODE??"").trim().toLowerCase()==="direct_postgres"?"b2":"supabase_storage")).trim().toLowerCase();
const LIMIT=Math.max(1,Math.min(10000,Number(process.env.RAW_SOURCE_SYNC_MAX_TARGETS??5000)));
const CONCURRENCY=Math.max(4,Math.min(16,Number(process.env.RAW_SOURCE_SYNC_CONCURRENCY??16)));
const RETRY_ATTEMPTS=4;
const FAILURE_RETRY_SECONDS=300;
const HOST_MIN_INTERVAL_MS=new Map([
  ["api.gdeltproject.org",2000],
  ["api.worldbank.org",300],
  ["www.usgs.gov",300],
]);
const UA="Geomacro-Country-Raw-Source-Mesh/1.0 (+https://geomacro.live)";
const SOURCE_HTTP_TIMEOUT_MS=Math.max(5000,Math.min(120000,Number(process.env.RAW_SOURCE_HTTP_TIMEOUT_MS??30000)));
const DB_REQUEST_TIMEOUT_MS=Math.max(5000,Math.min(120000,Number(process.env.RAW_SOURCE_DB_TIMEOUT_MS??30000)));
let b2Client=null;
function b2(){
  if(b2Client)return b2Client;
  const endpoint=String(process.env.B2_S3_ENDPOINT??B2_ENDPOINT).trim();
  if(endpoint!==B2_ENDPOINT||!process.env.B2_KEY_ID||!process.env.B2_APPLICATION_KEY)throw new Error("RAW_SOURCE_B2_CONFIG_REQUIRED");
  b2Client=createB2Client({endpointUrl:B2_ENDPOINT,accessKey:process.env.B2_KEY_ID,secretKey:process.env.B2_APPLICATION_KEY,bucket:B2_BUCKET});
  return b2Client;
}
function fetchWithTimeout(input,init={}){
  const timeout=AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS);
  const signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
  return fetch(input,{...init,signal});
}
const projectRef=(u)=>{try{return new URL(u).hostname.split(".")[0]??"";}catch{return "";}};
const hash=(b)=>createHash("sha256").update(b).digest("hex");
const txt=(v)=>String(v??"").replace(/\s+/g," ").trim();
const safe=(v)=>String(v).replace(/[^A-Za-z0-9._-]+/g,"_").slice(0,160);
function pageTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return txt(m?.[1]?.replace(/<[^>]+>/g," ")).slice(0,800);}
function links(html,base,limit=80){const out=[];const seen=new Set();const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;const host=new URL(base).hostname;while((m=re.exec(html))&&out.length<limit){try{const u=new URL(m[1],base);if(!/^https?:$/.test(u.protocol)||u.hostname!==host)continue;const t=txt(m[2].replace(/<[^>]+>/g," "));if(t.length<8||seen.has(u.href)||!/(news|press|media|release|statement|announcement|update|bulletin|publication|202[4-9]|latest|minister|econom|trade|mineral|mine|energy|security)/i.test(u.href))continue;seen.add(u.href);out.push({u:u.href,t:t.slice(0,800)});}catch{}}return out;}
function rssItems(xml, baseUrl, limit=100){
  const out=[];
  const text=String(xml);
  const blocks=[...text.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  for(const match of blocks.slice(0,limit)){
    const block=match[1]??"";
    const title=txt(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g," "));
    const linkMatch=block.match(/<link[^>]*(?:href=["']([^"']+)["']|>([^<]+)<\/link>)/i);
    const uRaw=linkMatch?.[1]??linkMatch?.[2]??baseUrl;
    let u=uRaw;
    try{u=new URL(uRaw,baseUrl).toString();}catch{u=baseUrl;}
    const date=txt(
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? block.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
      ?? block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]
      ?? ""
    ) || new Date().toISOString();
    const desc=txt(
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?? ""
    );
    if(title)out.push({u,t:title.slice(0,800),d:date,x:desc.slice(0,2400)});
  }
  return out;
}
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const hostTails=new Map();
const hostLastStart=new Map();
async function withHostPacing(url,fn){
  const host=new URL(url).hostname.toLowerCase();
  const prior=hostTails.get(host)??Promise.resolve();
  let release;
  const current=new Promise((resolve)=>{release=resolve;});
  hostTails.set(host,current);
  await prior;
  try{
    const minInterval=HOST_MIN_INTERVAL_MS.get(host)??150;
    const wait=minInterval-(Date.now()-(hostLastStart.get(host)??0));
    if(wait>0)await sleep(wait);
    hostLastStart.set(host,Date.now());
    return await fn();
  }finally{
    release();
    if(hostTails.get(host)===current)hostTails.delete(host);
  }
}
function retryAfterMs(value){
  const raw=String(value??"").trim();
  if(!raw)return null;
  const seconds=Number(raw);
  if(Number.isFinite(seconds))return Math.max(1000,Math.min(120000,seconds*1000));
  const at=Date.parse(raw);
  return Number.isFinite(at)?Math.max(1000,Math.min(120000,at-Date.now())):null;
}
async function fetchUrl(url){
  const retryable=new Set([408,425,429,500,502,503,504]);
  let lastError;
  for(let attempt=1;attempt<=RETRY_ATTEMPTS;attempt++){
    try{
      const result=await withHostPacing(url,async()=>{
        const r=await fetch(url,{headers:{accept:"text/html,application/xhtml+xml,application/json,application/xml,text/xml;q=0.8,*/*;q=0.2","user-agent":UA},redirect:"follow",signal:AbortSignal.timeout(SOURCE_HTTP_TIMEOUT_MS)});
        const bytes=Buffer.from(await r.arrayBuffer());
        return{status:r.status,ct:r.headers.get("content-type")??"",etag:r.headers.get("etag"),lm:r.headers.get("last-modified"),retryAfter:r.headers.get("retry-after"),final:r.url||url,bytes};
      });
      if(!retryable.has(result.status)||attempt===RETRY_ATTEMPTS)return result;
      const delay=retryAfterMs(result.retryAfter)??Math.min(30000,5000*(2**(attempt-1)));
      await sleep(delay);
    }catch(error){
      lastError=error;
      if(attempt===RETRY_ATTEMPTS)throw error;
      await sleep(Math.min(20000,1500*(2**(attempt-1))));
    }
  }
  throw lastError??new Error("RAW_SOURCE_FETCH_FAILED");
}
async function mark(db,t,p){const{error}=await db.from("live_raw_source_targets").update({...p,updated_at:new Date().toISOString()}).eq("target_id",t.target_id);if(error)throw error;}
async function verifiedArchiveWrite(path,bytes){
  if(ARCHIVE_MODE==="b2"){
    const key=`geomacro-evidence/v1/${path}`;
    await b2().put(key,bytes);
    const readback=await b2().get(key);
    if(readback.length!==bytes.length||hash(readback)!==hash(bytes))throw new Error("RAW_B2_READBACK_HASH_MISMATCH");
    return{storage_bucket:B2_BUCKET,object_path:key,verification_method:"b2-readback-sha256"};
  }
  if(ARCHIVE_MODE!=="supabase_storage")throw new Error("RAW_SOURCE_ARCHIVE_MODE_INVALID");
  return{storage_bucket:BUCKET,object_path:path,verification_method:"storage-readback-sha256"};
}
async function saveSnapshot(db,t,when,f){
  const b=f.bytes.length>4194304?f.bytes.subarray(0,4194304):f.bytes;
  const h=hash(b);
  const compressed=gzipSync(b);
  const path="raw/v1/"+t.country_iso3+"/"+t.category.toLowerCase()+"/"+safe(t.target_id)+"/"+when.replace(/[:.]/g,"-")+"-"+h.slice(0,16)+".gz";
  let location;
  if(ARCHIVE_MODE==="b2"){
    location=await verifiedArchiveWrite(path,compressed);
  }else{
    const up=await db.storage.from(BUCKET).upload(path,compressed,{contentType:"application/gzip",upsert:false});
    if(up.error&&!/already exists/i.test(up.error.message))throw up.error;
    const readback=await db.storage.from(BUCKET).download(path);
    if(readback.error||!readback.data)throw readback.error??new Error("RAW_SNAPSHOT_READBACK_FAILED");
    const readbackBytes=Buffer.from(await readback.data.arrayBuffer());
    if(hash(readbackBytes)!==hash(compressed))throw new Error("RAW_SNAPSHOT_READBACK_HASH_MISMATCH");
    location={storage_bucket:BUCKET,object_path:path,verification_method:"storage-readback-sha256"};
  }
  const{data,error}=await db.from("live_raw_source_snapshots").insert({
    target_id:t.target_id,country_iso3:t.country_iso3,category:t.category,fetched_at:when,
    source_url:f.final,http_status:f.status,content_type:f.ct,etag:f.etag,last_modified:f.lm,
    storage_bucket:location.storage_bucket,object_path:location.object_path,byte_count:b.length,content_sha256:h,
    parser_status:/json|xml/i.test(f.ct)?"STRUCTURED_PAYLOAD":/html/i.test(f.ct)?"HTML_LINKS_EXTRACTED":"RAW_CAPTURED",
    extracted_item_count:0
  }).select("snapshot_id").single();
  if(error)throw error;
  return data.snapshot_id;
}
async function saveFragment(db,t,when,rows){
  if(!rows.length)return null;
  const body=Buffer.from(rows.map(x=>JSON.stringify(x)).join("\n")+"\n");
  const comp=gzipSync(body),h=hash(body),ch=hash(comp);
  const prev=await db.from("live_fragment_manifest").select("compressed_sha256")
    .eq("source_key",SOURCE).eq("stream_key",t.target_id)
    .order("period_end",{ascending:false}).limit(1).maybeSingle();
  if(prev.error)throw prev.error;
  const path="fragments/v1/"+t.country_iso3+"/"+t.category.toLowerCase()+"/"+safe(t.target_id)+"/"+when.replace(/[:.]/g,"-")+"-"+ch.slice(0,16)+".ndjson.gz";
  let location;
  if(ARCHIVE_MODE==="b2"){
    location=await verifiedArchiveWrite(path,comp);
  }else{
    const up=await db.storage.from(BUCKET).upload(path,comp,{contentType:"application/gzip",upsert:false});
    if(up.error&&!/already exists/i.test(up.error.message))throw up.error;
    const readback=await db.storage.from(BUCKET).download(path);
    if(readback.error||!readback.data)throw readback.error??new Error("RAW_FRAGMENT_READBACK_FAILED");
    const readbackBytes=Buffer.from(await readback.data.arrayBuffer());
    if(hash(readbackBytes)!==ch)throw new Error("RAW_FRAGMENT_READBACK_HASH_MISMATCH");
    location={storage_bucket:BUCKET,object_path:path,verification_method:"storage-readback-sha256"};
  }
  const chain=hash((prev.data?.compressed_sha256??"GENESIS")+":"+ch);
  const{data,error}=await db.from("live_fragment_manifest").insert({
    source_key:SOURCE,stream_key:t.target_id,storage_bucket:location.storage_bucket,object_path:location.object_path,
    schema_version:"live-evidence-v1.0.0",compression:"gzip",period_start:when,period_end:when,
    item_count:rows.length,uncompressed_bytes:body.length,compressed_bytes:comp.length,
    payload_sha256:h,compressed_sha256:ch,previous_fragment_sha256:prev.data?.compressed_sha256??null,
    chain_sha256:chain,topics:[t.category.toLowerCase()],countries:[t.country_iso3],
    source_domains:[...new Set(rows.map(x=>x.h))],sealed_at:when,verified_at:when,
    verification_method:location.verification_method
  }).select("id").single();
  if(error)throw error;
  return data.id;
}
async function ensureCoverageTargets(db) {
  const expected = { GEOPOLITICS: 3, MACRO: 4, CRITICAL_MINERALS: 6 };
  const anchors = {
    GEOPOLITICS: { id: (iso) => "GEO:COVERAGE_FALLBACK:" + iso, source_id: "gdelt_v2", transport: "GLOBAL_FALLBACK", target_url: "https://www.gdeltproject.org/", display_name: (country) => "GDELT coverage fallback - " + country, cadence_seconds: 1800, priority: 1, notes: "Priority-1 country coverage anchor. Country-specific query is constructed by the worker; upstream national endpoints remain optional redundancy." },
    MACRO: { id: (iso) => "MACRO:COVERAGE_FALLBACK:" + iso, source_id: "world_bank_indicators", transport: "GLOBAL_FALLBACK", target_url: "https://api.worldbank.org/v2/", display_name: (country) => "World Bank coverage fallback - " + country, cadence_seconds: 7200, priority: 1, notes: "Priority-1 country coverage anchor using the country-specific World Bank API. National statistics and monetary-authority sources remain independent redundancy." },
    CRITICAL_MINERALS: { id: (iso) => "MINERALS:COVERAGE_FALLBACK:" + iso, source_id: "usgs_mcs", transport: "GLOBAL_FALLBACK", target_url: "https://www.usgs.gov/centers/national-minerals-information-center/data", display_name: (country) => "USGS minerals coverage fallback - " + country, cadence_seconds: 14400, priority: 1, notes: "Priority-1 country coverage anchor using the global USGS minerals baseline. RMIS and national minerals sources remain independent redundancy." }
  };
  const [directoryQuery, registryQuery] = await Promise.all([
    db.from("live_country_primary_source_directory").select("country_iso2,country_name").order("country_iso2", { ascending: true }),
    db.from("live_country_registry").select("iso3,iso2,country_name").eq("enabled", true).order("iso3", { ascending: true }),
  ]);
  if (directoryQuery.error) throw directoryQuery.error;
  if (registryQuery.error) throw registryQuery.error;
  const registryByIso2 = new Map((registryQuery.data ?? []).map((row) => [String(row.iso2).toUpperCase(), row]));
  const countries = (directoryQuery.data ?? []).map((row) => {
    const iso2 = String(row.country_iso2).toUpperCase();
    const registry = registryByIso2.get(iso2);
    return registry ? { iso3: String(registry.iso3), iso2, country_name: String(row.country_name) } : null;
  }).filter(Boolean);
  if (new Set(countries.map((row) => row.iso3)).size !== 195) {
    throw new Error("Expected exactly 195 canonical countries from the government-portal baseline; resolved " + new Set(countries.map((row) => row.iso3)).size);
  }
  const canonicalIso3 = countries.map((row) => row.iso3);
  const existing=[];
  for(let from=0;;from+=1000){
    const pageQuery=await db.from("live_raw_source_targets")
      .select("target_id,country_iso3,category,enabled")
      .eq("enabled", true).in("country_iso3", canonicalIso3).in("category", Object.keys(expected))
      .order("target_id", {ascending:true}).range(from,from+999);
    if(pageQuery.error)throw pageQuery.error;
    existing.push(...(pageQuery.data??[]));
    if((pageQuery.data??[]).length<1000)break;
  }
  const ids = new Set(existing.map((row) => String(row.target_id)));
  const counts = new Map();
  for (const row of existing) {
    const key = String(row.country_iso3) + "|" + String(row.category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [];
  for (const country of countries) {
    const iso = String(country.iso3);
    const name = String(country.country_name);
    const geoRedundancy = [
      {
        target_id: "GEO:GLOBAL:UNSC_RSS:" + iso,
        source_id: "un_security_council_docs_rss",
        transport: "RSS",
        target_url: "https://main.un.org/securitycouncil/en/rss",
        display_name: "UN Security Council RSS fallback - " + name,
        cadence_seconds: 900,
        priority: 15,
        notes: "Global institutional geopolitical event fallback. Country attribution is downstream; raw discovery/corroboration only."
      },
      {
        target_id: "GEO:GLOBAL:UN_GENEVA:" + iso,
        source_id: "un_geneva_press_rss",
        transport: "RSS",
        target_url: "https://www.ungeneva.org/news-media/press-releases-list/rss.xml",
        display_name: "UN Geneva press fallback - " + name,
        cadence_seconds: 900,
        priority: 16,
        notes: "Global UN press fallback. Country attribution is downstream; raw discovery/corroboration only."
      },
    ];
    const macroRedundancy = [
      {
        target_id: "MACRO:GLOBAL:IMF_NEWS:" + iso,
        source_id: "imf_news",
        transport: "RSS",
        target_url: "https://www.imf.org/en/News/RSS",
        display_name: "IMF global macro fallback - " + name,
        cadence_seconds: 3600,
        priority: 15,
        notes: "Global IMF macro fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MACRO:GLOBAL:BIS_RELEASES:" + iso,
        source_id: "bis_rss_media_releases",
        transport: "RSS",
        target_url: "https://www.bis.org/doclist/all_pressrels.rss",
        display_name: "BIS media releases fallback - " + name,
        cadence_seconds: 3600,
        priority: 16,
        notes: "Global BIS releases fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MACRO:GLOBAL:BIS_SPEECHES:" + iso,
        source_id: "bis_rss_central_banker_speeches",
        transport: "RSS",
        target_url: "https://www.bis.org/doclist/cbspeeches.rss",
        display_name: "BIS central banker speeches fallback - " + name,
        cadence_seconds: 3600,
        priority: 17,
        notes: "Global BIS central-banker speech fallback; country attribution is downstream and used as redundancy only."
      },
    ];
    const mineralRedundancy = [
      {
        target_id: "MINERALS:GLOBAL:IEA_CRITICAL_MINERALS:" + iso,
        source_id: "iea_critical_minerals",
        transport: "HTML",
        target_url: "https://www.iea.org/topics/critical-minerals",
        display_name: "IEA critical-minerals fallback - " + name,
        cadence_seconds: 7200,
        priority: 15,
        notes: "Global IEA critical-minerals fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MINERALS:GLOBAL:NR_CANADA:" + iso,
        source_id: "nrcan_news_atom",
        transport: "RSS",
        target_url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
        display_name: "NRCan critical-minerals fallback - " + name,
        cadence_seconds: 3600,
        priority: 16,
        notes: "Global NRCan mineral news fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MINERALS:GLOBAL:USGS_NEWS:" + iso,
        source_id: "usgs_minerals_news_rss",
        transport: "RSS",
        target_url: "https://www.usgs.gov/news/minerals/feed",
        display_name: "USGS minerals news fallback - " + name,
        cadence_seconds: 3600,
        priority: 17,
        notes: "Global USGS mineral news fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MINERALS:GLOBAL:EU_RMIS:" + iso,
        source_id: "eu_rmis",
        transport: "HTML",
        target_url: "https://rmis.jrc.ec.europa.eu/",
        display_name: "EU RMIS critical-minerals fallback - " + name,
        cadence_seconds: 7200,
        priority: 18,
        notes: "EU RMIS global mineral intelligence fallback; country attribution is downstream and used as redundancy only."
      },
      {
        target_id: "MINERALS:GLOBAL:IEA_REPORT:" + iso,
        source_id: "iea_critical_minerals",
        transport: "HTML",
        target_url: "https://www.iea.org/reports/global-critical-minerals-outlook-2025",
        display_name: "IEA critical-minerals outlook fallback - " + name,
        cadence_seconds: 21600,
        priority: 19,
        notes: "IEA structural critical-minerals outlook fallback; used only as non-current redundancy."
      },
    ];
    const extras = { GEOPOLITICS: geoRedundancy, MACRO: macroRedundancy, CRITICAL_MINERALS: mineralRedundancy };
    for (const category of Object.keys(expected)) {
      const anchor = anchors[category];
      const anchorId = anchor.id(iso);
      if (!ids.has(anchorId)) {
        rows.push({
          target_id: anchorId,
          country_iso3: iso,
          category,
          source_id: anchor.source_id,
          transport: anchor.transport,
          target_url: anchor.target_url,
          display_name: anchor.display_name(name),
          cadence_seconds: anchor.cadence_seconds,
          priority: anchor.priority,
          enabled: true,
          notes: anchor.notes,
        });
        ids.add(anchorId);
        const key = iso + "|" + category;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const extra of extras[category]) {
        if ((counts.get(iso + "|" + category) ?? 0) >= expected[category]) break;
        if (ids.has(extra.target_id)) continue;
        rows.push({ ...extra, country_iso3: iso, category, enabled: true });
        ids.add(extra.target_id);
        const key = iso + "|" + category;
        counts.set(key, (counts.get(key) ?? 0) + 1;
      }
    }
  }
  if (rows.length) {
    const { error } = await db.from("live_raw_source_targets").upsert(rows, { onConflict: "target_id" });
    if (error) throw error;
  }
}
async function main(){
  const url=process.env.APP_SUPABASE_URL??process.env.SUPABASE_URL,key=process.env.APP_SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||projectRef(url)!==REF)throw new Error("Authoritative Supabase credentials required");
  if(!["b2","supabase_storage"].includes(ARCHIVE_MODE))throw new Error("RAW_SOURCE_ARCHIVE_MODE_INVALID");
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchWithTimeout}});
  await ensureCoverageTargets(db);
  const allowlist=String(process.env.RAW_SOURCE_CATEGORY_ALLOWLIST??"").split(",").map(v=>v.trim()).filter(Boolean);
  let targets=[];
  for(let from=0;targets.length<LIMIT;from+=1000){
    let q=db.from("live_raw_source_targets").select("target_id,country_iso3,category,source_id,transport,target_url,display_name,cadence_seconds,priority,last_success_at,last_etag,last_modified").eq("enabled",true);
    if(allowlist.length)q=q.in("category",allowlist);
    const{data,error}=await q.order("priority",{ascending:true}).order("target_id",{ascending:true}).range(from,Math.min(from+999,LIMIT-1));
    if(error)throw error;
    targets.push(...(data??[]));
    if((data??[]).length<1000)break;
  }
  const now=new Date();
  const due=targets.filter(t=>!t.last_success_at||now-Date.parse(t.last_success_at)>=Number(t.cadence_seconds)*1000);
  let ok=0,fail=0,notModified=0,skipped=targets.length-due.length,alreadyFreshNonGdelt=0;const failures=[],fragmentIds=[];
  for (let offset=0;offset<due.length;offset+=CONCURRENCY){
    const batch=due.slice(offset,offset+CONCURRENCY);
    const results=await Promise.all(batch.map(async(t)=>{
      const when=new Date().toISOString();
      try{
        let fetchTarget=t.target_url;
        const headers={};
        if(t.transport==="GLOBAL_FALLBACK"&&t.source_id==="world_bank_indicators"){
          const iso2Row=await db.from("live_country_registry").select("iso2").eq("iso3",t.country_iso3).maybeSingle();
          if(iso2Row.error)throw iso2Row.error;
          const iso2=String(iso2Row.data?.iso2??"").toLowerCase();
          if(!iso2)throw new Error("WORLD_BANK_ISO2_UNRESOLVED");
          fetchTarget="https://api.worldbank.org/v2/country/"+encodeURIComponent(iso2)+"/indicator/NY.GDP.MKTP.CD?format=json&per_page=12";
        }
        let f=await fetchUrl(fetchTarget);
        if(f.status===304){await mark(db,t,{last_attempt_at:when,last_success_at:when,last_http_status:304,consecutive_failures:0,next_retry_at:null});return{ok:true,notModified:true,fragmentId:null,sourceId:t.source_id};}
        if(f.status<200||f.status>=300)throw new Error("HTTP "+f.status);
        const snapshot=await saveSnapshot(db,t,when,f);
        let items=[];
        const s=f.bytes.toString("utf8");
        if(/json/i.test(f.ct)){
          try{const j=JSON.parse(s); const arr=Array.isArray(j)?j:Array.isArray(j?.articles)?j.articles:Array.isArray(j?.data)?j.data:[]; items=arr.slice(0,100).map((x,i)=>({i:String(x.id??x.guid??x.url??i),u:String(x.url??f.final),d:String(x.date??x.published_at??x.updated_at??when),h:new URL(String(x.url??f.final)).hostname,o:t.display_name,t:txt(x.title??x.name??x.headline??JSON.stringify(x).slice(0,500)).slice(0,800),x:txt(x.description??x.summary??"").slice(0,2400),l:x.language??null,a:null,q:[t.category.toLowerCase()],g:when}));}catch{}
        }else if(/xml|rss|atom/i.test(f.ct)||/^(RSS|ATOM)$/i.test(t.transport)){items=rssItems(s,f.final);}
        if(!items.length&&/html/i.test(f.ct)){items=links(s,f.final).map((x,i)=>({i:String(i)+":"+hash(Buffer.from(x.u)).slice(0,20),u:x.u,d:when,h:new URL(x.u).hostname,o:t.display_name,t:x.t,x:"",l:null,a:null,q:[t.category.toLowerCase()],g:when}));}
        if(!items.length){items=[{i:t.target_id+":"+hash(Buffer.from(s)).slice(0,20),u:f.final,d:when,h:new URL(f.final).hostname,o:t.display_name,t:pageTitle(s)||t.display_name,x:"",l:null,a:null,q:[t.category.toLowerCase()],g:when}];}
        items=items.map((x)=>({i:String(x.i),u:x.u,d:x.d,h:x.h,o:x.o,t:x.t,x:x.x,l:x.l??null,a:x.a??null,q:x.q??[t.category.toLowerCase()],g:x.g??when}));
        const fragment=await saveFragment(db,t,when,items);
        await db.from("live_raw_source_snapshots").update({extracted_item_count:items.length}).eq("snapshot_id",snapshot);
        await mark(db,t,{last_attempt_at:when,last_success_at:when,last_http_status:f.status,last_etag:f.etag,last_modified:f.lm,last_content_sha256:hash(f.bytes.length>4194304?f.bytes.subarray(0,4194304):f.bytes),consecutive_failures:0,next_retry_at:null});
        return{ok:true,notModified:false,fragmentId:fragment,sourceId:t.source_id};
      }catch(e){
        const message=String(e?.message??e).slice(0,1000);
        try{await mark(db,t,{last_attempt_at:when,last_failure_at:when,last_error:message,next_retry_at:new Date(Date.now()+FAILURE_RETRY_SECONDS*1000).toISOString(),consecutive_failures:1});}catch{}
        return{ok:false,targetId:t.target_id,error:message,sourceId:t.source_id};
      }
    }));
    for(const r of results){if(r.ok){ok++;if(r.notModified)notModified++;if(r.fragmentId)fragmentIds.push(r.fragmentId);}else{fail++;failures.push({target_id:r.targetId,error:r.error});}}
  }
  const categories=[...new Set(targets.map(t=>t.category))].sort();
  if(allowlist.length===1&&due.length===0&&categories.length===1){alreadyFreshNonGdelt=targets.filter((t)=>t.source_id!=="gdelt_v2").length;}
  console.log(JSON.stringify({
    ok:fail===0,
    archive_mode:ARCHIVE_MODE,
    b2_usage:ARCHIVE_MODE==="b2"?b2().usage():null,
    total_targets:targets.length,
    due_targets:due.length,
    processed_cells:ok,
    skipped_cells:skipped,
    already_fresh_non_gdelt_cells:alreadyFreshNonGdelt,
    failed_cells:fail,
    not_modified:notModified,
    categories,
    missing_non_gdelt_paths:failures,
    fragment_ids:fragmentIds,
    failures:failures.slice(0,50)
  },null,2));
  if(fail)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exit(1)});
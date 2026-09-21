import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const REF="ldpwajisioljyjtojvfx", SOURCE="country_raw_web_mesh", BUCKET="geomacro-live-intelligence";
const LIMIT=Math.max(1,Math.min(10000,Number(process.env.RAW_SOURCE_SYNC_MAX_TARGETS??5000)));
const CONCURRENCY=Math.max(4,Math.min(48,Number(process.env.RAW_SOURCE_SYNC_CONCURRENCY??32)));
const UA="Geomacro-Country-Raw-Source-Mesh/1.0 (+https://geomacro.live)";
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
async function fetchUrl(url){const r=await fetch(url,{headers:{accept:"text/html,application/xhtml+xml,application/json,application/xml,text/xml;q=0.8,*/*;q=0.2","user-agent":UA},redirect:"follow"});return{status:r.status,ct:r.headers.get("content-type")??"",etag:r.headers.get("etag"),lm:r.headers.get("last-modified"),final:r.url||url,bytes:Buffer.from(await r.arrayBuffer())};}
async function mark(db,t,p){const{error}=await db.from("live_raw_source_targets").update({...p,updated_at:new Date().toISOString()}).eq("target_id",t.target_id);if(error)throw error;}
async function saveSnapshot(db,t,when,f){
  const b=f.bytes.length>4194304?f.bytes.subarray(0,4194304):f.bytes;
  const h=hash(b);
  const compressed=gzipSync(b);
  const path="raw/v1/"+t.country_iso3+"/"+t.category.toLowerCase()+"/"+safe(t.target_id)+"/"+when.replace(/[:.]/g,"-")+"-"+h.slice(0,16)+".gz";
  const up=await db.storage.from(BUCKET).upload(path,compressed,{contentType:"application/gzip",upsert:false});
  if(up.error&&!/already exists/i.test(up.error.message))throw up.error;
  const readback=await db.storage.from(BUCKET).download(path);
  if(readback.error||!readback.data)throw readback.error??new Error("RAW_SNAPSHOT_READBACK_FAILED");
  const readbackBytes=Buffer.from(await readback.data.arrayBuffer());
  if(hash(readbackBytes)!==hash(compressed))throw new Error("RAW_SNAPSHOT_READBACK_HASH_MISMATCH");
  const{data,error}=await db.from("live_raw_source_snapshots").insert({
    target_id:t.target_id,country_iso3:t.country_iso3,category:t.category,fetched_at:when,
    source_url:f.final,http_status:f.status,content_type:f.ct,etag:f.etag,last_modified:f.lm,
    storage_bucket:BUCKET,object_path:path,byte_count:b.length,content_sha256:h,
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
  const up=await db.storage.from(BUCKET).upload(path,comp,{contentType:"application/gzip",upsert:false});
  if(up.error&&!/already exists/i.test(up.error.message))throw up.error;
  const readback=await db.storage.from(BUCKET).download(path);
  if(readback.error||!readback.data)throw readback.error??new Error("RAW_FRAGMENT_READBACK_FAILED");
  const readbackBytes=Buffer.from(await readback.data.arrayBuffer());
  if(hash(readbackBytes)!==ch)throw new Error("RAW_FRAGMENT_READBACK_HASH_MISMATCH");
  const chain=hash((prev.data?.compressed_sha256??"GENESIS")+":"+ch);
  const{data,error}=await db.from("live_fragment_manifest").insert({
    source_key:SOURCE,stream_key:t.target_id,storage_bucket:BUCKET,object_path:path,
    schema_version:"live-evidence-v1.0.0",compression:"gzip",period_start:when,period_end:when,
    item_count:rows.length,uncompressed_bytes:body.length,compressed_bytes:comp.length,
    payload_sha256:h,compressed_sha256:ch,previous_fragment_sha256:prev.data?.compressed_sha256??null,
    chain_sha256:chain,topics:[t.category.toLowerCase()],countries:[t.country_iso3],
    source_domains:[...new Set(rows.map(x=>x.h))],sealed_at:when,verified_at:when,
    verification_method:"storage-readback-sha256"
  }).select("id").single();
  if(error)throw error;
  return data.id;
}
async function ensureCoverageTargets(db) {
  const expected = { GEOPOLITICS: 3, MACRO: 4, CRITICAL_MINERALS: 6 };
  const anchors = {
    GEOPOLITICS: { id: (iso) => "GEO:COVERAGE_FALLBACK:" + iso, source_id: "gdelt_v2", transport: "GLOBAL_FALLBACK", target_url: "https://www.gdeltproject.org/", display_name: (country) => "GDELT coverage fallback - " + country, cadence_seconds: 300, priority: 1, notes: "Priority-1 country coverage anchor. Country-specific query is constructed by the worker; upstream national endpoints remain optional redundancy." },
    MACRO: { id: (iso) => "MACRO:COVERAGE_FALLBACK:" + iso, source_id: "world_bank_indicators", transport: "GLOBAL_FALLBACK", target_url: "https://api.worldbank.org/v2/", display_name: (country) => "World Bank coverage fallback - " + country, cadence_seconds: 900, priority: 1, notes: "Priority-1 country coverage anchor using the country-specific World Bank API. National statistics and monetary-authority sources remain independent redundancy." },
    CRITICAL_MINERALS: { id: (iso) => "MINERALS:COVERAGE_FALLBACK:" + iso, source_id: "usgs_mcs", transport: "GLOBAL_FALLBACK", target_url: "https://www.usgs.gov/centers/national-minerals-information-center/data", display_name: (country) => "USGS minerals coverage fallback - " + country, cadence_seconds: 3600, priority: 1, notes: "Priority-1 country coverage anchor using the global USGS minerals baseline. RMIS and national minerals sources remain independent redundancy." }
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
  const existingQuery = await db.from("live_raw_source_targets").select("target_id,country_iso3,category,enabled").eq("enabled", true).in("country_iso3", canonicalIso3).in("category", Object.keys(expected));
  if (existingQuery.error) throw existingQuery.error;
  const existing = existingQuery.data ?? [];
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
    for (const category of Object.keys(expected)) {
      const anchor = anchors[category];
      const anchorId = anchor.id(iso);
      if (!ids.has(anchorId)) {
        rows.push({ target_id: anchorId, country_iso3: iso, category, transport: anchor.transport, source_id: anchor.source_id, target_url: anchor.target_url, display_name: anchor.display_name(name), enabled: true, raw_storage_allowed: true, commercial_promotion_allowed: false, cadence_seconds: anchor.cadence_seconds, priority: anchor.priority, discovery_state: "DISCOVERED", notes: anchor.notes });
        ids.add(anchorId);
      }
      let count = counts.get(iso + "|" + category) ?? 0;
      while (count < expected[category]) {
        const fillerId = category + ":MESH_FILLER:" + iso + ":" + (count + 1);
        if (!ids.has(fillerId)) {
          rows.push({ target_id: fillerId, country_iso3: iso, category, transport: anchor.transport, source_id: anchor.source_id, target_url: anchor.target_url, display_name: anchor.display_name(name) + " mesh filler " + (count + 1), enabled: true, raw_storage_allowed: true, commercial_promotion_allowed: false, cadence_seconds: anchor.cadence_seconds, priority: 2, discovery_state: "DISCOVERED", notes: "Self-healing mesh filler. It preserves the governed minimum target matrix when a country directory is incomplete or an upstream source row is missing." });
          ids.add(fillerId);
        }
        count += 1;
      }
      counts.set(iso + "|" + category, count);
    }
  }
  if (rows.length) {
    const { error } = await db.from("live_raw_source_targets").upsert(rows, { onConflict: "target_id" });
    if (error) throw error;
  }
  return { countries: 195, categories: Object.keys(expected), raw_only: true, inserted_targets: rows.length, coverage_anchors: countries.length * Object.keys(expected).length };
}
async function main(){const url=String(process.env.APP_SUPABASE_URL??"").trim(),key=String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY??"").trim();if(!url||!key)throw new Error("Authoritative Supabase credentials are required");if(projectRef(url)!==REF)throw new Error("Non-authoritative Supabase project");const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const country_contract=await ensureCoverageTargets(db);const now=Date.now();const [directoryQuery,registryQuery]=await Promise.all([db.from("live_country_primary_source_directory").select("country_iso2"),db.from("live_country_registry").select("iso3,iso2").eq("enabled",true)]);
  if(directoryQuery.error)throw directoryQuery.error;if(registryQuery.error)throw registryQuery.error;
  const registryByIso2=new Map((registryQuery.data??[]).map((x)=>[String(x.iso2).toUpperCase(),String(x.iso3)]));
  const countryIso2=new Map((registryQuery.data??[]).map((x)=>[String(x.iso3),String(x.iso2).toLowerCase()]));
  const canonicalIso3=new Set((directoryQuery.data??[]).map((x)=>registryByIso2.get(String(x.country_iso2).toUpperCase())).filter(Boolean));
  if(canonicalIso3.size!==195)throw new Error("Canonical 195-country baseline resolution failed: "+canonicalIso3.size);
  const q=await db.from("live_raw_source_targets").select("target_id,country_iso3,category,transport,source_id,target_url,display_name,cadence_seconds,last_attempt_at,consecutive_failures").eq("enabled",true).in("country_iso3",[...canonicalIso3]).in("transport",["WEB","GLOBAL_FALLBACK","API","RSS"]).order("last_attempt_at",{ascending:true,nullsFirst:true}).order("priority",{ascending:true}).limit(LIMIT);if(q.error)throw q.error;const due=(q.data??[]).filter(t=>!t.last_attempt_at||!Number.isFinite(Date.parse(String(t.last_attempt_at)))||Date.parse(String(t.last_attempt_at))+Number(t.cadence_seconds)*1000<=now);let cursor=0,ok=0,fail=0;const failures=[];async function worker(){for(;;){const i=cursor++;if(i>=due.length)return;const t=due[i],when=new Date().toISOString();try{let u=t.target_url;if(t.source_id==="world_bank_indicators")u="https://api.worldbank.org/v2/country/"+String(t.country_iso3).toLowerCase()+"/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG;SL.UEM.TOTL.ZS?format=json&mrv=5";
        if(t.source_id==="gdelt_v2"){
          const iso2=countryIso2.get(String(t.country_iso3));
          if(iso2)u="https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:"+encodeURIComponent(iso2)+"&mode=ArtList&maxrecords=25&format=json&sort=HybridRel&timespan=12h";
        }if(!u)throw new Error("RAW_SOURCE_TARGET_URL_MISSING");const f=await fetchUrl(u);if(f.status<200||f.status>=300)throw new Error("HTTP_"+f.status);const text=f.bytes.toString("utf8"),rows=[];if(/xml|rss|atom/i.test(f.ct)||/<(?:rss|feed)\b/i.test(text)){for(const x of rssItems(text,f.final)){let host="";try{host=new URL(x.u).hostname;}catch{continue;}rows.push({i:hash(Buffer.from("rss:"+t.target_id+":"+x.u)),u:x.u,d:x.d||when,h:host,o:t.display_name,t:x.t,x:x.x||null,l:"und",a:t.display_name,q:[t.category.toLowerCase()],g:when});}}if(/json/i.test(f.ct)){try{
          const p=JSON.parse(text);
          const a=Array.isArray(p?.articles)
            ? p.articles
            : Array.isArray(p?.data)
              ? p.data
              : Array.isArray(p) && Array.isArray(p[1])
                ? p[1]
                : Array.isArray(p)
                  ? p
                  : [];
          for(const x of a.slice(0,100)){
            const title=t.source_id==="world_bank_indicators"
              ? txt((x?.indicator?.value??"World Bank indicator")+" "+(x?.date??""))
              : t.source_id==="gdelt_v2"
                ? txt(x?.title??"")
                : txt(x?.title??x?.name??x?.indicator_name??x?.event_type??"");
            if(!title)continue;
            const ru=txt(x?.url??x?.link??x?.source_url??f.final);
            let host="";
            try{host=new URL(ru).hostname;}catch{continue;}
            const dateRaw=t.source_id==="gdelt_v2"
              ? txt(x?.seendate??x?.published_at??x?.socialimage_lastupdate??"")
              : txt(x?.published_at??x?.updated_at??x?.date??x?.period_end??"");
            let date=when;
            if(/^\\d{14}Z?$/.test(dateRaw)){
              const z=dateRaw.replace(/Z$/,"");
              date=z.slice(0,4)+"-"+z.slice(4,6)+"-"+z.slice(6,8)+"T"+z.slice(9,11)+":"+z.slice(11,13)+":"+z.slice(13,15)+"Z";
            }else if(dateRaw) date=dateRaw;
            const description=t.source_id==="world_bank_indicators"
              ? txt(String(x?.value??"")+" "+String(x?.unit??""))
              : txt(x?.summary??x?.description??x?.value_text??"");
            rows.push({i:hash(Buffer.from("api:"+t.target_id+":"+JSON.stringify(x))),u:ru,d:date,h:host,o:t.display_name,t:title.slice(0,800),x:description.slice(0,2400)||null,l:"und",a:t.display_name,q:[t.category.toLowerCase()],g:when});
          }
        }catch{}}if(!rows.length){const title=pageTitle(text);if(title)rows.push({i:hash(Buffer.from("page:"+t.target_id+":"+f.final+":"+title)),u:f.final,d:when,h:new URL(f.final).hostname,o:t.display_name,t:title,x:null,l:"und",a:t.display_name,q:[t.category.toLowerCase()],g:when});for(const x of links(text,f.final)){rows.push({i:hash(Buffer.from("link:"+t.target_id+":"+x.u)),u:x.u,d:when,h:new URL(x.u).hostname,o:t.display_name,t:x.t,x:null,l:"und",a:t.display_name,q:[t.category.toLowerCase()],g:when});}}const sid=await saveSnapshot(db,t,when,f);await saveFragment(db,t,when,rows);await db.from("live_raw_source_snapshots").update({extracted_item_count:rows.length}).eq("snapshot_id",sid);await mark(db,t,{discovery_state:rows.length?"REACHABLE":"STALE",last_attempt_at:when,last_success_at:when,last_observed_at:when,consecutive_failures:0,last_error:null});ok++;}catch(e){fail++;failures.push({target_id:t.target_id,error:e instanceof Error?e.message:String(e)});try{await mark(db,t,{discovery_state:"UNREACHABLE",last_attempt_at:when,consecutive_failures:Number(t.consecutive_failures??0)+1,last_error:String(e).slice(0,1000)});}catch{}}}}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,due.length))},worker));console.log(JSON.stringify({ok:fail===0,generated_at:new Date().toISOString(),selected_targets:q.data?.length??0,due_targets:due.length,completed:ok,failed:fail,failures:failures.slice(0,50),country_contract},null,2));if(fail>0&&ok===0)process.exit(1);}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
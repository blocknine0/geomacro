import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const REF="ldpwajisioljyjtojvfx", SOURCE="country_raw_web_mesh", BUCKET="geomacro-live-intelligence";
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
        const r=await fetch(url,{headers:{accept:"text/html,application/xhtml+xml,application/json,application/xml,text/xml;q=0.8,*/*;q=0.2","user-agent":UA},redirect:"follow"});
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
        target_id: "GEO:GLOBAL:UKMTO:" + iso,
        source_id: "ukmto_maritime_security",
        transport: "WEB",
        target_url: "https://www.ukmto.org/",
        display_name: "UKMTO maritime-security fallback - " + name,
        cadence_seconds: 900,
        priority: 18,
        notes: "Global operational maritime-security fallback. Country attribution is downstream; raw source reuse remains certification-gated."
      }
    ];
    for (const target of geoRedundancy) {
      if (!ids.has(target.target_id)) {
        rows.push({
          target_id: target.target_id,
          country_iso3: iso,
          category: "GEOPOLITICS",
          transport: target.transport,
          source_id: target.source_id,
          target_url: target.target_url,
          display_name: target.display_name,
          enabled: true,
          raw_storage_allowed: true,
          commercial_promotion_allowed: false,
          cadence_seconds: target.cadence_seconds,
          priority: target.priority,
          discovery_state: "DISCOVERED",
          notes: target.notes
        });
        ids.add(target.target_id);
      }
    }

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

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase credentials are required");
  if (projectRef(url) !== REF) throw new Error("Non-authoritative Supabase project");

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const countryContract = await ensureCoverageTargets(db);
  const nowMs = Date.now();
  const requestedCategories = String(process.env.RAW_SOURCE_CATEGORY_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const categories = requestedCategories.length
    ? requestedCategories.filter((value) => ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"].includes(value))
    : ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];
  if (!categories.length) throw new Error("RAW_SOURCE_CATEGORY_ALLOWLIST_EMPTY");
  const windows = { GEOPOLITICS: 1800, MACRO: 7200, CRITICAL_MINERALS: 14400 };

  const [directoryQuery, registryQuery] = await Promise.all([
    db.from("live_country_primary_source_directory").select("country_iso2"),
    db.from("live_country_registry").select("iso3,iso2").eq("enabled", true),
  ]);
  if (directoryQuery.error) throw directoryQuery.error;
  if (registryQuery.error) throw registryQuery.error;

  const registryByIso2 = new Map(
    (registryQuery.data ?? []).map((row) => [
      String(row.iso2).toUpperCase(),
      String(row.iso3).toUpperCase(),
    ]),
  );
  const countryIso2 = new Map(
    (registryQuery.data ?? []).map((row) => [
      String(row.iso3).toUpperCase(),
      String(row.iso2).toLowerCase(),
    ]),
  );
  const canonicalIso3 = [
    ...new Set(
      (directoryQuery.data ?? [])
        .map((row) => registryByIso2.get(String(row.country_iso2).toUpperCase()))
        .filter(Boolean),
    ),
  ].sort();

  if (canonicalIso3.length !== 195) {
    throw new Error(
      "Canonical 195-country baseline resolution failed: " + canonicalIso3.length,
    );
  }

  const rows = [];
  for (let from = 0; ; from += 1000) {
    const q = await db
      .from("live_raw_source_targets")
      .select(
        "target_id,country_iso3,category,transport,source_id,target_url,display_name,cadence_seconds,priority,last_attempt_at,last_success_at,consecutive_failures",
      )
      .eq("enabled", true)
      .in("country_iso3", canonicalIso3)
      .in("category", categories)
      .not("target_id", "like", "%MESH_FILLER%")
      .not("transport", "eq", "TELEGRAM_DISCOVERY")
      .order("country_iso3", { ascending: true })
      .order("category", { ascending: true })
      .order("priority", { ascending: true, nullsFirst: false })
      .order("last_success_at", { ascending: true, nullsFirst: true })
      .order("target_id", { ascending: true })
      .range(from, from + 999);

    if (q.error) throw q.error;
    rows.push(...(q.data ?? []));
    if ((q.data ?? []).length < 1000) break;
  }

  const byCell = new Map();
  const cellKey = (country, category) => country + "::" + category;

  for (const country of canonicalIso3) {
    for (const category of categories) {
      byCell.set(cellKey(country, category), []);
    }
  }

  for (const row of rows) {
    const country = String(row.country_iso3 ?? "").toUpperCase();
    const category = String(row.category ?? "");
    if (!byCell.has(cellKey(country, category))) continue;
    if (!row.target_url) continue;
    byCell.get(cellKey(country, category)).push(row);
  }

  const isGdelt = (row) => /gdelt/i.test(String(row.source_id ?? ""));
  const isFresh = (row, category) => {
    const timestamp = Date.parse(String(row.last_success_at ?? ""));
    return Number.isFinite(timestamp) &&
      nowMs - timestamp <= windows[category] * 1000 &&
      row.discovery_state !== "UNREACHABLE" &&
      row.discovery_state !== "STALE";
  };
  const isDue = (row) => {
    const lastAttempt = Date.parse(String(row.last_attempt_at ?? ""));
    const failures = Number(row.consecutive_failures ?? 0);
    const retrySeconds = failures > 0
      ? FAILURE_RETRY_SECONDS
      : Math.max(60, Number(row.cadence_seconds ?? windows[row.category] ?? 900));
    return !Number.isFinite(lastAttempt) || lastAttempt + retrySeconds * 1000 <= nowMs;
  };

  const work = [];
  const alreadyFreshNonGdelt = [];
  const noNonGdeltPath = [];
  const maxCellAttempts = Math.max(
    1,
    Math.min(5, Number(process.env.RAW_SOURCE_CELL_MAX_ATTEMPTS ?? 3)),
  );

  for (const [key, candidates] of byCell.entries()) {
    const parts = key.split("::");
    const country = parts[0];
    const category = parts[1];

    if (candidates.some((row) => !isGdelt(row) && isFresh(row, category))) {
      alreadyFreshNonGdelt.push({ country_iso3: country, category });
      continue;
    }

    const nonGdeltCandidates = candidates
      .filter((row) => !isGdelt(row) && isDue(row))
      .sort((a, b) => {
        const priority = Number(a.priority ?? 999) - Number(b.priority ?? 999);
        if (priority !== 0) return priority;
        const aLast = Date.parse(String(a.last_success_at ?? "")) || 0;
        const bLast = Date.parse(String(b.last_success_at ?? "")) || 0;
        return aLast - bLast || String(a.target_id).localeCompare(String(b.target_id));
      });

    const availableNonGdelt = candidates
      .filter((row) => !isGdelt(row))
      .sort((a, b) => {
        const priority = Number(a.priority ?? 999) - Number(b.priority ?? 999);
        if (priority !== 0) return priority;
        const aLast = Date.parse(String(a.last_success_at ?? "")) || 0;
        const bLast = Date.parse(String(b.last_success_at ?? "")) || 0;
        return aLast - bLast || String(a.target_id).localeCompare(String(b.target_id));
      });

    if (!availableNonGdelt.length) {
      noNonGdeltPath.push({ country_iso3: country, category });
      continue;
    }

    const selected = nonGdeltCandidates.length
      ? nonGdeltCandidates.slice(0, maxCellAttempts)
      : availableNonGdelt.slice(0, maxCellAttempts);

    work.push({ country_iso3: country, category, candidates: selected });
  }

  let cursor = 0;
  let successfulCells = 0;
  let failedCells = 0;
  let targetAttempts = 0;
  const failures = [];
  const fragmentIds = [];

  async function processTarget(t, countryIso3) {
    const when = new Date().toISOString();
    let targetUrl = t.target_url;

    if (t.source_id === "world_bank_indicators") {
      targetUrl =
        "https://api.worldbank.org/v2/country/" +
        String(countryIso3).toLowerCase() +
        "/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG;SL.UEM.TOTL.ZS?format=json&mrv=5";
    }

    if (t.source_id === "gdelt_v2") {
      const iso2 = countryIso2.get(String(countryIso3).toUpperCase());
      if (iso2) {
        targetUrl =
          "https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:" +
          encodeURIComponent(iso2) +
          "&mode=ArtList&maxrecords=25&format=json&sort=HybridRel&timespan=12h";
      }
    }

    if (!targetUrl) throw new Error("RAW_SOURCE_TARGET_URL_MISSING");

    const fetched = await fetchUrl(targetUrl);
    if (fetched.status < 200 || fetched.status >= 300) {
      throw new Error("HTTP_" + fetched.status);
    }

    const bodyText = fetched.bytes.toString("utf8");
    const extracted = [];

    if (
      /xml|rss|atom/i.test(fetched.ct) ||
      /<(?:rss|feed)\b/i.test(bodyText)
    ) {
      for (const item of rssItems(bodyText, fetched.final)) {
        let host = "";
        try {
          host = new URL(item.u).hostname;
        } catch {
          continue;
        }
        extracted.push({
          i: hash(Buffer.from("rss:" + t.target_id + ":" + item.u)),
          u: item.u,
          d: item.d || when,
          h: host,
          o: t.display_name,
          t: item.t,
          x: item.x || null,
          l: "und",
          a: t.display_name,
          q: [String(t.category).toLowerCase()],
          g: when,
        });
      }
    }

    if (/json/i.test(fetched.ct)) {
      try {
        const parsed = JSON.parse(bodyText);
        const values = Array.isArray(parsed?.articles)
          ? parsed.articles
          : Array.isArray(parsed?.data)
            ? parsed.data
            : Array.isArray(parsed) && Array.isArray(parsed[1])
              ? parsed[1]
              : Array.isArray(parsed)
                ? parsed
                : [];

        for (const item of values.slice(0, 100)) {
          const title =
            t.source_id === "world_bank_indicators"
              ? txt(
                  (item?.indicator?.value ?? "World Bank indicator") +
                    " " +
                    (item?.date ?? ""),
                )
              : t.source_id === "gdelt_v2"
                ? txt(item?.title ?? "")
                : txt(
                    item?.title ??
                      item?.name ??
                      item?.indicator_name ??
                      item?.event_type ??
                      "",
                  );

          if (!title) continue;

          const rawUrl = txt(
            item?.url ?? item?.link ?? item?.source_url ?? fetched.final,
          );
          let host = "";
          try {
            host = new URL(rawUrl).hostname;
          } catch {
            continue;
          }

          const dateRaw =
            t.source_id === "gdelt_v2"
              ? txt(
                  item?.seendate ??
                    item?.published_at ??
                    item?.socialimage_lastupdate ??
                    "",
                )
              : txt(
                  item?.published_at ??
                    item?.updated_at ??
                    item?.date ??
                    item?.period_end ??
                    "",
                );

          let date = when;
          if (/^\d{14}Z?$/.test(dateRaw)) {
            const z = dateRaw.replace(/Z$/, "");
            date =
              z.slice(0, 4) +
              "-" +
              z.slice(4, 6) +
              "-" +
              z.slice(6, 8) +
              "T" +
              z.slice(9, 11) +
              ":" +
              z.slice(11, 13) +
              ":" +
              z.slice(13, 15) +
              "Z";
          } else if (dateRaw) {
            date = dateRaw;
          }

          const description =
            t.source_id === "world_bank_indicators"
              ? txt(String(item?.value ?? "") + " " + String(item?.unit ?? ""))
              : txt(
                  item?.summary ??
                    item?.description ??
                    item?.value_text ??
                    "",
                );

          extracted.push({
            i: hash(
              Buffer.from(
                "api:" + t.target_id + ":" + JSON.stringify(item),
              ),
            ),
            u: rawUrl,
            d: date,
            h: host,
            o: t.display_name,
            t: title.slice(0, 800),
            x: description.slice(0, 2400) || null,
            l: "und",
            a: t.display_name,
            q: [String(t.category).toLowerCase()],
            g: when,
          });
        }
      } catch {
        // Preserve the raw snapshot when a structured parser cannot decode it.
      }
    }

    if (!extracted.length) {
      const title = pageTitle(bodyText);
      if (title) {
        extracted.push({
          i: hash(
            Buffer.from(
              "page:" + t.target_id + ":" + fetched.final + ":" + title,
            ),
          ),
          u: fetched.final,
          d: when,
          h: new URL(fetched.final).hostname,
          o: t.display_name,
          t: title,
          x: null,
          l: "und",
          a: t.display_name,
          q: [String(t.category).toLowerCase()],
          g: when,
        });
      }

      for (const item of links(bodyText, fetched.final)) {
        extracted.push({
          i: hash(Buffer.from("link:" + t.target_id + ":" + item.u)),
          u: item.u,
          d: when,
          h: new URL(item.u).hostname,
          o: t.display_name,
          t: item.t,
          x: null,
          l: "und",
          a: t.display_name,
          q: [String(t.category).toLowerCase()],
          g: when,
        });
      }
    }

    const snapshotId = await saveSnapshot(db, t, when, fetched);
    const fragmentId = await saveFragment(db, t, when, extracted);
    await db
      .from("live_raw_source_snapshots")
      .update({ extracted_item_count: extracted.length })
      .eq("snapshot_id", snapshotId);

    const { error: updateError } = await db
      .from("live_raw_source_targets")
      .update({
        discovery_state: extracted.length ? "REACHABLE" : "STALE",
        last_attempt_at: when,
        last_success_at: when,
        last_observed_at: when,
        consecutive_failures: 0,
        last_error: null,
        updated_at: when,
      })
      .eq("target_id", t.target_id);

    if (updateError) throw updateError;
    return fragmentId;
  }

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= work.length) return;

      const cell = work[index];
      let cellSucceeded = false;
      const attempted = [];

      for (const target of cell.candidates) {
        targetAttempts += 1;
        attempted.push(target.target_id);

        try {
          const fragmentId = await processTarget(target, cell.country_iso3);
          if (fragmentId) fragmentIds.push(String(fragmentId));
          cellSucceeded = true;
          successfulCells += 1;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({
            country_iso3: cell.country_iso3,
            category: cell.category,
            target_id: target.target_id,
            error: message,
          });

          try {
            await mark(db, target, {
              discovery_state: "UNREACHABLE",
              last_attempt_at: new Date().toISOString(),
              consecutive_failures: Number(target.consecutive_failures ?? 0) + 1,
              last_error: message.slice(0, 1000),
            });
          } catch {
            // Preserve the original source failure in the run summary.
          }
        }
      }

      if (!cellSucceeded) {
        failedCells += 1;
        failures.push({
          country_iso3: cell.country_iso3,
          category: cell.category,
          target_id: null,
          attempted,
          error: "NO_FRESH_NON_GDELT_TARGET_SUCCEEDED",
        });
      }
    }
  }

  const concurrency = Math.max(
    4,
    Math.min(16, Number(process.env.RAW_SOURCE_SYNC_CONCURRENCY ?? 16)),
  );
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, work.length)) },
      worker,
    ),
  );

  const result = {
    ok: failedCells === 0 && noNonGdeltPath.length === 0,
    generated_at: new Date().toISOString(),
    canonical_countries: canonicalIso3.length,
    categories,
    expected_cells: canonicalIso3.length * categories.length,
    candidate_targets: rows.length,
    work_cells: work.length,
    already_fresh_non_gdelt_cells: alreadyFreshNonGdelt.length,
    processed_cells: successfulCells,
    failed_cells: failedCells,
    missing_non_gdelt_paths: noNonGdeltPath,
    target_attempts: targetAttempts,
    failures: failures.slice(0, 100),
    fragment_ids: [...new Set(fragmentIds)],
    country_contract: countryContract,
    runtime_contract: {
      freshness_windows_seconds: windows,
      non_gdelt_required: true,
      per_cell_target_attempts: maxCellAttempts,
      telegram_discovery_excluded_from_runtime_truth: true,
      fillers_excluded_from_runtime_refresh: true,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exit(1);});
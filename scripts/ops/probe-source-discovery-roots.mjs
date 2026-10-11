#!/usr/bin/env node
/**
 * Free-tier, read-only health rotation over ALL governed discovery-root URLs.
 * Cataloguing 535 root web pages does not turn them into RSS/JSON adapters:
 * only the HTTP availability of the selected exact root is checked.
 * Never downloads publisher articles, follows redirects, probes login forms,
 * enters raw content in GitHub artifacts or starts commercial ingestion.
 */
import {createHash} from "node:crypto";
import {isIP} from "node:net";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {URL,pathToFileURL} from "node:url";

export const MAX_ROOTS_PER_WINDOW=40;
const SLOT_MS=90*60*1000;
const VALID=new Set(["GEOPOLITICS","MACRO","CRITICAL_MINERALS"]);

export function approvedRoot(value) {
  try {
    const u=new URL(String(value));
    const host=u.hostname.toLowerCase();
    const reservedHost=host==="localhost" ||
      host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".test");
    const ipHost=isIP(host)===4 || isIP(host)===6 ||
      /^[0-9.]+$/u.test(host) || host.includes(":");
    if(u.protocol!=="https:" || u.port!=="" || u.username!=="" ||
       u.password!=="" || u.hash!=="" || !host.includes(".") ||
       reservedHost || ipHost || u.href.length>2048)return null;
    return u;
  }catch{return null;}
}
export function selectGovernedRootWindow(catalog,now=new Date()){
  const roots=catalog?.roots;
  if(!Array.isArray(roots)||roots.length===0||roots.length>1500||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("ROOT_HEALTH_CATALOG_OR_CLOCK_INVALID");
  const seen=new Set();
  for(const r of roots){
    if(!/^[a-z0-9][a-z0-9_.:-]{0,179}$/i.test(String(r?.source_id??"")) ||
       !VALID.has(r.category)||seen.has(r.source_id))
      throw Error("ROOT_HEALTH_SOURCE_ID_OR_CATEGORY_INVALID");
    seen.add(r.source_id);
  }
  const windowCount=Math.ceil(roots.length/MAX_ROOTS_PER_WINDOW);
  const index=((Math.floor(now.getTime()/SLOT_MS)%windowCount)+windowCount)%windowCount;
  return {index,windowCount,roots:roots.slice(index*MAX_ROOTS_PER_WINDOW,(index+1)*MAX_ROOTS_PER_WINDOW)};
}

export async function probeGovernedRoots({
  catalog,now=new Date(),fetchImpl=fetch,
}={}){
  const slot=selectGovernedRootWindow(catalog,now);
  const rows=Array(slot.roots.length);
  let cursor=0;
  async function worker(){
    for(;;){
      const i=cursor++;
      if(i>=slot.roots.length)return;
      const source=slot.roots[i], url=approvedRoot(source.root_url);
      const row={source_ref:createHash("sha256").update(source.category+":"+source.source_id)
        .digest("hex").slice(0,24),category:source.category,
        status:"ROOT_TRANSPORT_UNAVAILABLE",http_status:null,
        discovery_only:true,original_feed_activated:false};
      if(!url){row.status="ROOT_INVALID_OR_UNSAFE_URL";rows[i]=row;continue;}
      let response=null;
      try{
        response=await fetchImpl(url.href,{
          method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(4000),
          headers:{"user-agent":"Geomacro-Private-Discovery-Root-Health/1.0"},
        });
        // HEAD unsupported at the exact reviewed root. A single no-body GET
        // for 405/501 only; not a bypass for access-control or rate limiting.
        if([405,501].includes(response.status)){
          try{await response.body?.cancel();}catch{}
          response=await fetchImpl(url.href,{
            method:"GET",redirect:"manual",signal:AbortSignal.timeout(4000),
            headers:{"range":"bytes=0-0",
              "user-agent":"Geomacro-Private-Discovery-Root-Health/1.0"},
          });
        }
        row.http_status=response.status;
        if(response.status>=200&&response.status<300)
          row.status="ROOT_HTTP_REACHABLE";
        else if(response.status>=300&&response.status<400)
          row.status="ROOT_REDIRECT_UNVERIFIED";
        else if([401,403].includes(response.status))
          row.status="ROOT_ACCESS_DENIED";
        else if(response.status===429)
          row.status="ROOT_RATE_LIMITED";
        else if(response.status===404||response.status===410)
          row.status="ROOT_REMOVED";
        else row.status="ROOT_HTTP_UNAVAILABLE";
        try{await response.body?.cancel();}catch{}
      }catch {
        row.status="ROOT_TRANSPORT_UNAVAILABLE";
      }
      rows[i]=row;
    }
  }
  await Promise.all(Array.from({length:Math.min(4,slot.roots.length)},()=>worker()));
  const counts=Object.fromEntries([...new Set([...VALID])].map(d=>{
    const p=rows.filter(r=>r.category===d);
    return [d,{checked:p.length,http_reachable:p.filter(r=>r.status==="ROOT_HTTP_REACHABLE").length}];
  }));
  return {
    schema:"geomacro.discovery-root-rotating-http-health.v1",
    observed_at:now.toISOString(),source_catalog_count:catalog.roots.length,
    window_index:slot.index,window_count:slot.windowCount,
    checked_roots:rows.length,other_roots_not_checked_this_window:catalog.roots.length-rows.length,
    http_reachable:rows.filter(r=>r.status==="ROOT_HTTP_REACHABLE").length,
    per_domain:counts,
    // A root homepage is NOT a machine feed, nor a proof of independent
    // article publication, Telegram authorization or 195-country coverage.
    http_root_observation_only:true,original_articles_ingested:0,
    registered_roots_auto_activated_as_news_feeds:0,
    all_sources_working_claim:false,commercial_eligible:false,
    b2_requests:0,supabase_writes:0,d1_writes:0,payment_performed:false,
    rows,
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{
    const catalog=JSON.parse(readFileSync("config/telegram-discovery-roots.json","utf8"));
    const receipt=await probeGovernedRoots({catalog});
    mkdirSync("artifacts/private-intake",{recursive:true});
    writeFileSync("artifacts/private-intake/discovery-root-health.json",
      JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({schema:receipt.schema,checked_roots:receipt.checked_roots,
      total:receipt.source_catalog_count,window_index:receipt.window_index,
      http_reachable:receipt.http_reachable,per_domain:receipt.per_domain,
      all_sources_working_claim:false}));
  }catch{
    console.error("ROOT_HEALTH_RECEIPT_INVALID");
    process.exitCode=2;
  }
}

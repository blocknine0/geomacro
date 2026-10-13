#!/usr/bin/env node
/**
 * #2042: transport-only weekly recovery canary for exactly TWO historically
 * unreachable official publisher RSS endpoints. EITI 403 is NEVER polled.
 *
 * No same-institution mirror, redirected host, scraped HTML, auth/rate-limit
 * bypass, publisher text storage, D1/B2/Supabase traffic, x402 or scoring.
 * A green canary only signals that an original publisher RSS endpoint is
 * reachable with a parsable item; it does NOT unquarantine automatically.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {isQuarantinedOfficialRoute} from "../lib/official-source-quarantine.mjs";
const MAX_BYTES=192*1024;
const TIMEOUT_MS=6_000;
const OUTPUT="artifacts/expanded-official-source/quarantined-rss-recovery-canary.json";
export const QUARANTINED_RSS_CANARIES=Object.freeze([
  Object.freeze({
    id:"nrcan_simply_science_official_rss_review",domain:"rare_earth",
    url:"https://natural-resources.canada.ca/simply-science/rss.xml",
  }),
  Object.freeze({
    id:"usgs_minerals_original_news_rss_review",domain:"rare_earth",
    url:"https://www.usgs.gov/news/minerals/feed",
  }),
]);
const SAFE_ORIGINS=new Set([
  "https://natural-resources.canada.ca",
  "https://www.usgs.gov",
]);
const XML_MIME=/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
const fail=()=>{throw Error("QUARANTINE_CANARY_REGISTRY_INVALID")};
export async function observeQuarantinedRssRecovery({
  fetchImpl=fetch,now=new Date(),
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     QUARANTINED_RSS_CANARIES.length!==2)fail();
  const rows=[];
  for(const source of QUARANTINED_RSS_CANARIES){
    const uri=new URL(source.url);
    if(!isQuarantinedOfficialRoute(source.id)||
       !SAFE_ORIGINS.has(uri.origin)||
       uri.protocol!=="https:"||uri.search||uri.hash||uri.username||uri.password)
      fail();
    let status="TRANSPORT_UNAVAILABLE",http_status=null,items=0;
    let response;
    try{
      response=await fetchImpl(uri.href,{
        method:"GET",redirect:"error",
        headers:{Accept:"application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8"},
        signal:AbortSignal.timeout(TIMEOUT_MS),
      });
      http_status=response.status;
      if([401,403,429].includes(http_status))
        status="AUTH_OR_RATE_LIMIT_DENIED";
      else if(http_status!==200||response.redirected===true||
        response.url&&response.url!==uri.href)
        status="HTTP_OR_REDIRECT_UNVERIFIED";
      else if(!XML_MIME.test(response.headers?.get("content-type")??""))
        status="RSS_MIME_NOT_VERIFIED";
      else if(Number(response.headers.get("content-length")||0)>MAX_BYTES)
        status="RSS_BODY_OVERSIZE";
      else if(!response.body)
        status="RSS_BODY_EMPTY";
      else{
        const reader=response.body.getReader(),chunks=[];
        let size=0,oversize=false;
        try{
          for(;;){
            const {done,value}=await reader.read();
            if(done)break;
            size+=value.byteLength;
            if(size>MAX_BYTES){oversize=true;await reader.cancel();break;}
            chunks.push(value);
          }
        }catch{status="RSS_BODY_UNREADABLE"}
        finally{reader.releaseLock();}
        if(oversize)status="RSS_BODY_OVERSIZE";
        else if(status!=="RSS_BODY_UNREADABLE"){
          const body=new TextDecoder().decode(Buffer.concat(chunks.map(x=>Buffer.from(x))));
          const root=body.trimStart().replace(/^<\?xml[^>]*\?>\s*/iu,"")
            .replace(/^(?:<!--[\s\S]*?-->\s*)*/u,"");
          if(!/^<(?:rss|feed|rdf:RDF)\b/iu.test(root))
            status="RSS_XML_ROOT_INVALID";
          else{
            items=[...body.matchAll(/<(?:item|entry)(?:\s[^>]*)?>/giu)].length;
            status=items>0?"ORIGINAL_RSS_TRANSPORT_RECOVERED":
              "RSS_VALID_EMPTY_NO_ORIGINALS";
          }
        }
      }
    }catch{status="TRANSPORT_UNAVAILABLE"}
    finally{try{await response?.body?.cancel()}catch{}}
    rows.push({
      domain:source.domain,
      status,http_status,
      sampled_feed_item_count:Math.min(items,60),
      issuer_original_article_time_verified:false,
      source_commercial_rights_verified:false,
      automatic_unquarantine_performed:false,
      observed_original_articles_stored:0,
    });
  }
  return {
    schema:"geomacro.quarantined-first-party-rss-recovery-canary.v1",
    checked_at:now.toISOString(),publisher_probe_count:2,
    eiti_403_source_retried:false,
    recovered_readable_xml_rss_transport_count:
      rows.filter(r=>r.status==="ORIGINAL_RSS_TRANSPORT_RECOVERED").length,
    observations:rows,
    all_quarantines_unblocked:false,
    current_native_first_published_events_verified:false,
    signed_risk_generated:false,commercial_eligible:false,
    payment_authorized:false,raw_source_exposed:false,
    d1_writes:0,b2_requests:0,supabase_requests:0,payments:0,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const out=await observeQuarantinedRssRecovery();
    mkdirSync("artifacts/expanded-official-source",{recursive:true});
    writeFileSync(OUTPUT,JSON.stringify(out)+"\n",{mode:0o600});
    console.log(JSON.stringify({schema:out.schema,
      checked_at:out.checked_at,
      publisher_probe_count:out.publisher_probe_count,
      recovered_readable_xml_rss_transport_count:out.recovered_readable_xml_rss_transport_count,
      all_quarantines_unblocked:false,payment_authorized:false}));
  }catch{console.error("QUARANTINED_RSS_RECOVERY_CANARY_INVALID");process.exitCode=2}
}

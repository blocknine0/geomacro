import {readCategoryOpenData} from "./category-open-data.server";
import {validOpenDataContext} from "./category-open-data-contract";
import {readGdeltEventDiscovery} from "./gdelt-event-discovery.server";
import {probeQuotaSafeDiscovery} from "../../scripts/lib/quota-safe-original-discovery-fallback.mjs";
import {probeOpenDiscoveryMesh,pollOpenDiscovery} from "../../scripts/lib/market-signal-discovery.mjs";
import {probeGdeltGkgBulk} from "../../scripts/lib/gdelt-gkg-bulk-discovery.mjs";
import {fetchGdeltDocWithBudget} from "../../scripts/lib/gdelt-doc-request-gate.mjs";
import {canonicalJson} from "./canonical-json";

const CATEGORIES={geopolitics:"geopolitics",macro:"macro-fx",rare_earth:"critical-minerals"} as const;
export const SOURCE_RUNTIME_REPLACEMENTS=Object.freeze({
  phase_a_heartbeat:"canonical_195_registry_and_d1_cursors",
  gdelt_v2:"integrity_checked_event_export_country_aggregates",
  gdelt_gal:"existing_gkg_static_discovery_and_first_party_date_checks",
  rss_live:"existing_automated_finds_d1_journal",
  open_realtime_mesh:"existing_category_open_data_readers",
  country_raw_mesh:"existing_195_country_on_demand_discovery",
  realtime_fanout:"canonical_country_category_routing_without_raw_fanout",
});
// Supabase-free compatibility of the former source stage. This does not
// recreate raw database tables, score events, certify rights or issue GROs.
export async function runSupabaseFreeSourceRuntime({state,fetchImpl=fetch,now=new Date(),
  readOpen=readCategoryOpenData,eventRead=readGdeltEventDiscovery,discoveryRead=probeQuotaSafeDiscovery,
}:{state:{loadRows:Function;persist:Function};fetchImpl?:typeof fetch;now?:Date;
  readOpen?:typeof readCategoryOpenData;eventRead?:typeof readGdeltEventDiscovery;discoveryRead?:typeof probeQuotaSafeDiscovery}){
  const at=now.getTime();if(!Number.isFinite(at))throw Error("SOURCE_RUNTIME_CLOCK_INVALID");
  const previous=await state.loadRows();
  let supabaseAttempts=0;const blockedHosts=new Set<string>();
  const manifests=new Map<string,Promise<Response>>();
  const safeFetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(/(?:^|\.)supabase\.(?:co|com)$/i.test(url.hostname)){supabaseAttempts++;throw Error("SOURCE_RUNTIME_SUPABASE_BLOCKED");}
    if(blockedHosts.has(url.hostname))throw Error("SOURCE_RUNTIME_UPSTREAM_DENIAL_HELD");
    if(["https://data.gdeltproject.org/gdeltv2/lastupdate.txt","https://data.gdeltproject.org/gdeltv2/masterfilelist.txt"].includes(url.href)){
      // The existing GKG and Event adapters share ONE small manifest read.
      if(!manifests.has(url.href))manifests.set(url.href,fetchImpl(input,init));
      return (await manifests.get(url.href)!).clone();
    }
    const response=url.hostname==="api.gdeltproject.org"&&fetchImpl===fetch
      ?await fetchGdeltDocWithBudget(String(input),init,fetchImpl):await fetchImpl(input,init);
    if([401,403,429].includes(response.status))blockedHosts.add(url.hostname);
    return response;
  }) as typeof fetch;
  const contextPromise=Promise.all(Object.entries(CATEGORIES).map(async([scope,category])=>({scope,category,
    context:await readOpen(category,{now:at,fetcher:safeFetch,fallbackToD1:false})})));
  const [contexts,event,discovery]=await Promise.all([
    contextPromise,eventRead({fetchImpl:safeFetch,now}),
    discoveryRead({now,gkgProbe:opts=>probeGdeltGkgBulk({...opts,fetchImpl:safeFetch}),
      primaryProbe:()=>probeOpenDiscoveryMesh({now,fetchCategory:(category)=>pollOpenDiscovery(category,{now,fetchImpl:safeFetch})})}),
  ]);
  const expected=new Map<string,unknown>();
  for(const {scope,category,context} of contexts){
    const old=previous.get(scope);
    const usable=validOpenDataContext(context,category,at);
    const prior=old?.payload?.context;
    const stored={context:usable?context:validOpenDataContext(prior,category,at)?prior:null,
      latest_reader_status:context.status,latest_readable_families:context.source_families_readable};
    expected.set(scope,stored.context);
    if(/https?:\/\/|www\./iu.test(JSON.stringify(stored)))throw Error("SOURCE_RUNTIME_RAW_CONTENT_REFUSED");
    await state.persist(scope,stored,{cursor:{status:context.source_families_unavailable===0?"healthy":"degraded"},
      last_attempt_at:now.toISOString(),last_success_at:usable?now.toISOString():old?.last_success_at??null});
  }
  const gkg=discovery.gdelt_static_bulk_discovery??null;
  const report={schema:"geomacro.supabase-free-source-runtime.v1",checked_at:now.toISOString(),
    replacements:SOURCE_RUNTIME_REPLACEMENTS,
    gdelt_event:event,gdelt_gkg:gkg,
    contexts:contexts.map(({scope,context})=>({category:scope,source_families_attempted:context.source_families_attempted,
      source_families_readable:context.source_families_readable,derived_context_count:context.findings.length})),
    state_storage:"cloudflare_d1_derived_only",raw_records_persisted:false,supabase_requests:supabaseAttempts,
    b2_requests:0,payments:0,scored:false,independent_reviewed:false,chargeable:false};
  if(supabaseAttempts!==0||JSON.stringify(report).length>64_000||/https?:\/\/|www\./iu.test(JSON.stringify(report)))
    throw Error("SOURCE_RUNTIME_BOUNDARY_FAILED");
  const healthy=contexts.every(x=>x.context.source_families_readable>0)&&!!event&&typeof event==="object"&&"archive_integrity_verified" in event&&(event as {archive_integrity_verified?:unknown}).archive_integrity_verified===true&&gkg?.archive_integrity_verified===true;
  await state.persist("summary",{report},{cursor:{status:healthy?"healthy":"degraded"},
    last_attempt_at:now.toISOString(),last_success_at:healthy?now.toISOString():previous.get("summary")?.last_success_at??null});
  const readback=await state.loadRows();
  if(canonicalJson(readback.get("summary")?.payload?.report)!==canonicalJson(report))throw Error("SOURCE_RUNTIME_EXACT_D1_READBACK_FAILED");
  for(const {scope} of contexts){
    const current=readback.get(scope)?.payload;
    if(!current||typeof current.latest_reader_status!=="string"||
      canonicalJson(current.context)!==canonicalJson(expected.get(scope)))throw Error("SOURCE_RUNTIME_CONTEXT_READBACK_FAILED");
  }
  return {...report,source_reads_healthy:healthy,d1_exact_readback_verified:true};
}

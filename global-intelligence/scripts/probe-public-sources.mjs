import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {probePublicSource,publicSources} from "../adapters/public-sources.mjs";

// Only listed source adapters are actually queried. A catalogued source or
// website root by itself is not a working machine-data endpoint.
export const PUBLIC_ADAPTER_DOMAINS=Object.freeze({
  ecb:"MACRO",imf:"MACRO",oecd:"MACRO",bis:"MACRO",
  eurostat:"MACRO",gdacs:"GEOPOLITICS",comtrade:"MACRO",
  faostat:"MACRO",ilostat:"MACRO",swpc:"GEOPOLITICS",
  bgs:"CRITICAL_MINERALS",sec_edgar:"MACRO",
  copernicus_ems:"CRITICAL_MINERALS",
});

export async function probePublicSourcesIndependently({
  probe=probePublicSource,now=()=>new Date(),
}={}) {
  const t=now();
  if(!(t instanceof Date)||!Number.isFinite(t.getTime()) ||
    Object.keys(publicSources).length!==Object.keys(PUBLIC_ADAPTER_DOMAINS).length ||
    Object.keys(publicSources).some(id=>!PUBLIC_ADAPTER_DOMAINS[id]))
    throw Error("PUBLIC_SOURCE_PROBE_REGISTRY_INVALID");
  const results=[];
  for(const id of Object.keys(publicSources)){
    try{
      const x=await probe(id);
      if(x?.source_id && ![id,{
        ecb:"ecb",imf:"imf_sdmx",oecd:"oecd_sdmx",bis:"bis_statistics",
        gdacs:"gdacs_global_disasters",comtrade:"un_comtrade",
        faostat:"faostat_global",ilostat:"ilostat_global",
        swpc:"noaa_swpc",bgs:"bgs_world_minerals_statistics",
      }[id]].includes(x.source_id)) throw Error("PUBLIC_SOURCE_ID_MISMATCH");
      if(!Number.isSafeInteger(x?.observations)||x.observations<0)
        throw Error("PUBLIC_SOURCE_COUNT_INVALID");
      results.push({source_id:id,category:PUBLIC_ADAPTER_DOMAINS[id],
        status:x.observations>0?"WORKING_DATA_RESPONSE":"WORKING_EMPTY_DATA_RESPONSE",
        observation_rows:x.observations});
    }catch{
      // Never publish upstream error texts or URLs. Some free provider errors
      // echo queries, IPs, dynamic request headers, and body fragments.
      results.push({source_id:id,category:PUBLIC_ADAPTER_DOMAINS[id],
        status:"PROVIDER_UNAVAILABLE_OR_SHAPE_CHANGED",
        observation_rows:null});
    }
  }
  const failures=results.filter(r=>r.status==="PROVIDER_UNAVAILABLE_OR_SHAPE_CHANGED").length;
  return {
    schema:"geomacro.public-free-source-actual-health.v1",
    observed_at:t.toISOString(),mode:"READ_ONLY_ACTUAL_ADAPTER_PROBES",
    adapter_count:results.length,
    working:results.length-failures,failed:failures,
    status:failures===0?"ALL_PUBLIC_ADAPTERS_RESPONDED":
      "SOME_PUBLIC_ADAPTERS_DEGRADED",
    per_domain:Object.fromEntries(["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].map(d=>{
      const rows=results.filter(x=>x.category===d);
      return [d,{probed:rows.length,working:rows.filter(
        r=>r.status!=="PROVIDER_UNAVAILABLE_OR_SHAPE_CHANGED").length}];
    })),
    // Baseline and contextual datasets are not breaking news or verified
    // original publisher evidence; no pipeline/catalog false positives.
    original_events_scored:0,raw_data_published:false,
    source_rights_verified:false,commercial_eligible:false,
    d1_writes:0,b2_requests:0,supabase_writes:0,payment_performed:false,
    results,
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const result=await probePublicSourcesIndependently();
    console.log(JSON.stringify(result,null,2));
    if(result.failed>0)process.exitCode=3;
  }catch{
    console.error("PUBLIC_SOURCE_RECEIPT_INVALID");
    process.exitCode=2;
  }
}

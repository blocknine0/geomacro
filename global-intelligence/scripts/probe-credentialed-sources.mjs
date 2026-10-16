import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { probeCredentialedSource } from "../adapters/credentialed-sources.mjs";

// The public/source-catalog entry is not proof of a configured account or a
// successful response. Probe each configured account INDEPENDENTLY so that
// one absent API key cannot suppress valid feeds in the other two domains.
export const CREDENTIALED_SOURCE_ACCOUNTS = Object.freeze([
  Object.freeze({id:"bls",category:"MACRO",env:"BLS_API_KEY"}),
  Object.freeze({id:"bea",category:"MACRO",env:"BEA_API_KEY"}),
  Object.freeze({id:"alpha_vantage",category:"MACRO",env:"ALPHA_VANTAGE_API_KEY"}),
  Object.freeze({id:"eia_api_v2",category:"CRITICAL_MINERALS",env:"EIA_API_KEY"}),
  Object.freeze({id:"noaa_ncei",category:"GEOPOLITICS",env:"NOAA_NCEI_TOKEN"}),
  Object.freeze({id:"wto_timeseries",category:"MACRO",env:"WTO_API_KEY"}),
  Object.freeze({id:"ucdp_ged",category:"GEOPOLITICS",env:"UCDP_API_TOKEN"}),
  Object.freeze({id:"opensanctions",category:"GEOPOLITICS",env:"OPENSANCTIONS_API_KEY"}),
]);

export async function probeConfiguredCredentialedSources({
  env=process.env, probe=probeCredentialedSource, now=()=>new Date(),
}={}) {
  const started=now();
  if (!(started instanceof Date) || !Number.isFinite(started.getTime()))
    throw Error("CREDENTIALED_PROBE_CLOCK_INVALID");
  const results=[];
  for (const source of CREDENTIALED_SOURCE_ACCOUNTS) {
    // Never log, return, store or include the secret value in errors.
    if (typeof env[source.env]!=="string" || !env[source.env].trim()) {
      results.push({source_id:source.id,category:source.category,
        status:"CREDENTIAL_NOT_CONFIGURED",requires_secret:source.env,
        http_probed:false});
      continue;
    }
    try {
      const observation=await probe(source.id);
      if (observation?.category!==source.category ||
          observation?.source_id!==source.id) throw Error("BAD_OBSERVATION");
      results.push({source_id:source.id,category:source.category,
        status:"WORKING_RESPONSE_VALIDATED",http_probed:true});
    } catch (error) {
      // The upstream adapter error can include a secret-bearing URL. Only
      // known, exact error CLASS tokens are allowed into monitoring output.
      const message=String(error?.message??"");
      const http=message.match(/^HTTP ([1-5][0-9]{2}) for /u)?.[1];
      const cause=http?("HTTP_"+http):
        message.startsWith("Non-JSON response from ")?"RESPONSE_NOT_JSON":
        message==="Unexpected response shape for "+source.id?"RESPONSE_SHAPE_INVALID":
        error?.name==="AbortError"||error?.name==="TimeoutError"?"UPSTREAM_TIMEOUT":
        "UPSTREAM_UNKNOWN_FAILURE";
      results.push({source_id:source.id,category:source.category,
        status:"CONFIGURED_BUT_PROBE_FAILED",http_probed:true,
        reason:cause});
    }
  }
  const counts={
    configured:results.filter(x=>x.http_probed).length,
    working:results.filter(x=>x.status==="WORKING_RESPONSE_VALIDATED").length,
    missing_credentials:results.filter(x=>x.status==="CREDENTIAL_NOT_CONFIGURED").length,
    configured_failed:results.filter(x=>x.status==="CONFIGURED_BUT_PROBE_FAILED").length,
  };
  return {
    schema:"geomacro.credentialed-source-isolated-readiness.v1",
    observed_at:started.toISOString(),
    mode:"READ_ONLY_BOUNDED_ACTUAL_ACCOUNT_PROBES",
    status:counts.configured===0?"NO_CREDENTIALS_CONFIGURED":
      counts.configured_failed>0?"CONFIGURED_SOURCES_DEGRADED":
      counts.missing_credentials>0?"CONFIGURED_SOURCES_WORKING_PARTIAL":
      "ALL_CONFIGURED_SOURCES_WORKING",
    source_count:CREDENTIALED_SOURCE_ACCOUNTS.length,
    ...counts,
    per_domain:Object.fromEntries(["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].map(domain=>{
      const rows=results.filter(x=>x.category===domain);
      return [domain,{catalogued:rows.length,
        configured:rows.filter(x=>x.http_probed).length,
        working:rows.filter(x=>x.status==="WORKING_RESPONSE_VALIDATED").length}];
    })),
    // Probe success is NOT current news, consumer permission or paid rights.
    private_observations_published:false,source_rights_approved:false,
    current_scored_stories_proven:false,commercial_eligible:false,
    supabase_writes:0,b2_requests:0,d1_writes:0,funds_touched:false,
    results,
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const receipt=await probeConfiguredCredentialedSources();
    console.log(JSON.stringify(receipt,null,2));
    // A missing unrelated key is an honest per-source BLOCKED row, not an
    // excuse to abandon the other configured sources. A configured failed
    // source (or no configured sources at all) remains an alert.
    if(receipt.configured===0 || receipt.configured_failed>0)
      process.exitCode=3;
  } catch {
    console.error("CREDENTIALED_SOURCE_RECEIPT_INVALID");
    process.exitCode=2;
  }
}

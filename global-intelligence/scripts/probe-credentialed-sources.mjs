import {probeCredentialedSource} from "../adapters/credentialed-sources.mjs";

const sources = ["bls","bea","alpha_vantage","eia_api_v2","noaa_ncei","wto_timeseries","opensanctions"];
const results = [];

for (const source of sources) {
  const started = Date.now();
  try {
    const result = await probeCredentialedSource(source);
    results.push({source_id:source,status:"PASS",latency_ms:Date.now()-started,category:result.category});
  } catch (error) {
    const message = String(error?.message || error).replace(/https?:\/\/\S+/g, "[redacted-url]");
    results.push({source_id:source,status:"FAIL",latency_ms:Date.now()-started,error:message});
  }
}

const failed = results.filter(x=>x.status!=="PASS");
console.log(JSON.stringify({
  version:"1.0",
  mode:"credentialed_source_runtime_probe",
  generated_at:new Date().toISOString(),
  source_count:sources.length,
  passed:sources.length-failed.length,
  failed:failed.length,
  results
},null,2));

if (failed.length) process.exit(1);

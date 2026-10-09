#!/usr/bin/env node
/**
 * Deployment acceptance of the Cloudflare Intelligence WORKER ONLY.
 * Website publication, current 3-domain scoring and x402 remain separately
 * governed in Production Website Health / Exact-Head Launch Readiness.
 * Two public GETs per try; never a direct B2/Supabase or payment call.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { verifyIntelligenceWorkerB2D1Deployment } from
  "../lib/intelligence-edge-b2-d1-deploy-proof.mjs";

const URLS=Object.freeze({
  edge:"https://geomacro-intelligence.daspallab202391.workers.dev/intelligence",
  overlay:"https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-overlay",
});
const MAX_BODY_BYTES=256_000;
const ATTEMPTS=6;
const RETRY_MS=6_000;

export async function probeWorkerDeploy(url,{fetchImpl=fetch}={}) {
  const response=await fetchImpl(url,{
    method:"GET",
    redirect:"error",
    headers:{Accept:"application/json","Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(12_000),
  });
  const data=await response.text();
  if(data.length>MAX_BODY_BYTES)
    throw new Error("INTELLIGENCE_EDGE_DEPLOY_RESPONSE_TOO_LARGE");
  let payload=null;
  try {payload=JSON.parse(data);}
  catch {throw new Error("INTELLIGENCE_EDGE_DEPLOY_NON_JSON_RESPONSE");}
  return {
    status:response.status,
    authority:response.headers.get("x-geomacro-authority"),
    current_overlay:response.headers.get("x-geomacro-current-overlay"),
    b2_sha256:response.headers.get("x-geomacro-b2-sha256"),
    verified_b2_sha256:payload?.verified_b2_sha256??null,
    current_source_batch_at:payload?.current_source_batch_at??null,
    payload,
  };
}

export async function verifyWorkerDeployment({
  fetchImpl=fetch,
  sleep=ms=>new Promise(done=>setTimeout(done,ms)),
  now=()=>Date.now(),
}={}) {
  let lastCode="INTELLIGENCE_EDGE_DEPLOY_B2_D1_NOT_CONVERGED";
  for(let attempt=1;attempt<=ATTEMPTS;attempt++){
    try {
      const [edge,overlay]=await Promise.all([
        probeWorkerDeploy(URLS.edge,{fetchImpl}),
        probeWorkerDeploy(URLS.overlay,{fetchImpl}),
      ]);
      const report=verifyIntelligenceWorkerB2D1Deployment({
        edge,overlay,now:now(),
      });
      return {...report,attempt,live_worker_only:true};
    } catch(error) {
      const reason=error instanceof Error?error.message:"";
      lastCode=/^INTELLIGENCE_EDGE_DEPLOY_[A-Z0-9_]+$/u.test(reason)
        ?reason:"INTELLIGENCE_EDGE_DEPLOY_PUBLIC_SOURCE_UNAVAILABLE";
      if(attempt<ATTEMPTS)await sleep(RETRY_MS);
    }
  }
  throw new Error(lastCode);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try {
    console.log(JSON.stringify(await verifyWorkerDeployment()));
  } catch(error) {
    const code=error instanceof Error?error.message:"INTELLIGENCE_EDGE_DEPLOY_FAILED";
    // No untrusted HTTP body, provider names, rows, source titles or URLs.
    console.error(JSON.stringify({
      ok:false,
      error:code,
      worker_deploy_accepted:false,
      website_current_ready:false,
      commercial_ready:false,
      external_payment_performed:false,
      supabase_reads:0,
      direct_b2_reads:0,
    }));
    process.exitCode=3;
  }
}

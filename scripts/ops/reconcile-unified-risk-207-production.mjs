/** Owner-only, noncommercial reconciliation of exactly today's 207 canonical
 * D1 snapshots against the *actual* private Supabase SHA256 readback.
 * Existing snapshot bytes are immutable. No news fetch, signature creation,
 * signed-GRO eligibility promotion, B2 writes or customer charges.
 */
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export const RISK_207_CANONICAL_ORIGIN=
 "https://geomacro-control-plane.daspallab202391.workers.dev";
const TOKEN=/^[a-f0-9]{64}$/u;
export const RISK_207_PAGES=18;
export const risk207PageExpected=i=>i===17?3:12;
function fail(code){throw Error(code)}
async function readJson(fetcher,url,{method="GET",token,body}={}){
 let res;
 try{
  res=await fetcher(url,{method,redirect:"error",cache:"no-store",
   signal:AbortSignal.timeout(35000),
   headers:{"Authorization":"Bearer "+token,"Accept":"application/json",
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
 }catch{fail("RISK_207_OWNER_EDGE_UNREACHABLE")}
 if(res.status!==200)fail("RISK_207_OWNER_HTTP_"+String(res.status));
 try{return await res.json()}catch{fail("RISK_207_OWNER_INVALID_JSON")}
}
function censusValid(c){
 return c?.schema==="geomacro.unified-risk-census.v1"&&c.ok===true&&
  c.expected?.total===207&&c.country_count===195&&c.corridor_count===12&&
  c.commercial_activation===false;
}
function complete(c){
 return censusValid(c)&&c.complete===true&&c.country_synced===195&&
  c.corridor_synced===12&&c.supabase_live_readback_verified===true&&
  c.remote_count===207&&c.remote_hash_matches===207&&
  c.remote_readback_status==="MATCHED";
}
export async function reconcileRisk207Production({
 fetcher=fetch,token,origin=RISK_207_CANONICAL_ORIGIN,
}={}){
 if(origin!==RISK_207_CANONICAL_ORIGIN||!TOKEN.test(String(token??"")))
  fail("RISK_207_OWNER_AUTH_OR_ORIGIN_INVALID");
 const endpoint=origin+"/v1/internal/risk-gate/";
 const first=await readJson(fetcher,endpoint+"unified-census",{token});
 if(!censusValid(first))fail("RISK_207_D1_CANONICAL_CENSUS_INCOMPLETE");
 if(complete(first))return {ok:true,verified:207,remote_sha_matches:207,
  repaired:0,pages_checked:0,already_complete:true,
  no_funds:true,commercial_activation:false};
 let repaired=0;
 for(let page=0;page<RISK_207_PAGES;page++){
  const result=await readJson(fetcher,endpoint+"unified-reconcile-page",{
   method:"POST",token,body:{page}
  });
  if(result?.schema!=="geomacro.unified-risk-reconcile-page.v1"||
   result.ok!==true||result.page!==page||
   result.receipt_count!==risk207PageExpected(page)||
   result.remote_hash_readback_verified!==true||
   result.no_funds!==true||result.commercial_activation!==false||
   !Number.isInteger(result.remote_rows_repaired)||
   result.remote_rows_repaired<0||
   result.remote_rows_repaired>risk207PageExpected(page))
   fail("RISK_207_EXACT_PAGE_SHA_READBACK_FAILED_"+String(page));
  repaired+=result.remote_rows_repaired;
 }
 const final=await readJson(fetcher,endpoint+"unified-census",{token});
 if(!complete(final))fail("RISK_207_REMOTE_CENSUS_STILL_INCOMPLETE");
 return {ok:true,verified:207,remote_sha_matches:207,
  repaired,pages_checked:RISK_207_PAGES,already_complete:false,
  no_funds:true,commercial_activation:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await reconcileRisk207Production({
   token:process.env.CONTROL_PLANE_TOKEN,
  });
  console.log(JSON.stringify({schema:"geomacro.risk-207-reconciled-verified.v1",...result}));
 }catch(error){
  const e=error instanceof Error?error.message:"RISK_207_UNKNOWN_ERROR";
  // Bounded enums only: no remote JSON, payload, B2, source, bearer or SQL.
  if(/^RISK_207_[A-Z0-9_]+$/u.test(e))console.error(e);
  else console.error("RISK_207_UNHANDLED_FAILURE");
  process.exitCode=1;
 }
}

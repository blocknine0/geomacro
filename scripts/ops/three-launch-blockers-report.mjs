import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Summarize separate real observations; never use website news or country
// routing as signed commercial evidence. Unknown remains unknown.
export function summarizeLaunchAcceptance({coverage=null,latency=null,health=null,
 healthStatus=0,paymentStatus=null,checkedAt=new Date().toISOString()}={}){
 const now=Date.parse(checkedAt);
 if(!Number.isFinite(now))throw Error('LAUNCH_ACCEPTANCE_CLOCK_INVALID');
 const coverageShape=coverage?.schema==='geomacro.country-195-live-original-proof-rollup.v1'&&
  Array.isArray(coverage.cells)&&coverage.cells.length===585&&
  new Set(coverage.cells.map(c=>c.iso3+':'+c.category)).size===585;
 const currentCells=coverageShape?coverage.cells.filter(c=>c.current_original_proof_verified===true&&
  Number.isFinite(Date.parse(c.last_probe_at))&&Date.parse(c.last_probe_at)<=now+60000&&
  now-Date.parse(c.last_probe_at)<86400000).length:0;
 const observed=Date.parse(latency?.observed_at);
 const currentLatency=Number.isFinite(observed)&&observed<=now+60000&&now-observed<=300000;
 const sample=currentLatency&&latency?.schema==='geomacro.website-observed-publication-latency.v1'&&
  latency.actual_website_20min_sample_verified===true&&
  Array.isArray(latency.samples)&&latency.samples.some(s=>s.within_20_minutes===true&&
   s.latency_upper_bound_seconds>=900&&s.latency_upper_bound_seconds<=1200&&
   Date.parse(s.website_observed_at)===observed&&
   Number.isFinite(Date.parse(s.source_published_at))&&
   Math.ceil((observed-Date.parse(s.source_published_at))/1000)===s.latency_upper_bound_seconds);
 const products=health?.public_production?.current_hot_product_ready;
 const hot=products&&['intelligence','global_risk','risk_indices'].filter(k=>products[k]===true).length||0;
 const mainnet=paymentStatus?.environment==='production'&&paymentStatus?.network==='eip155:8453'&&paymentStatus?.configured===true;
 return {schema:'geomacro.three-launch-blockers-report.v1',checked_at:checkedAt,
  country_category_proof:{state:currentCells===585?'CURRENT_ORIGINAL_PROOFS_OBSERVED':'INCOMPLETE',
   trusted_receipt_available:coverageShape,
   required_cells:585,current_verified_cells:currentCells,
   missing_or_stale_cells:585-currentCells,
   nominal_bounded_sweep_days:65,source_registry_count_is_not_proof:true},
  original_to_website_latency:{state:!latency?'NO_TRUSTED_LATENCY_RECEIPT':
    sample?'QUALIFYING_LIVE_SAMPLE_OBSERVED':'NO_QUALIFYING_LIVE_SAMPLE',
   qualifying_20min_sample_observed:sample,receipt_current:currentLatency,universal_20min_sla_verified:false,
   measurement:'SERVED_ARTICLE_HTML_RECEIPT_UPPER_BOUND'},
  signed_commercial_serving:{deep_health_http:healthStatus,
   verified_current_hot_products:hot,required_hot_products:3,
   production_base_configured:mainnet,paid_delivery_verified:false,
   three_chain_settlement_verified:false,
   state:healthStatus===200&&health?.ok===true&&hot===3&&mainnet
    ?'HOT_SERVING_OBSERVED_PAYMENT_ACCEPTANCE_STILL_REQUIRED':'BLOCKED'},
  payments_performed:0,source_content_logged:false,
  public_launch_acceptance_complete:false};
}
async function local(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
async function publicJson(path){
 try{
  const r=await fetch('https://geomacro.live'+path,{redirect:'error',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)});
  const raw=await r.text();if(raw.length>150000)throw Error('OVERSIZE');
  return {status:r.status,body:JSON.parse(raw)};
 }catch{return {status:0,body:null};}
}
export async function runLaunchAcceptanceReport(){
 const [coverage,latency,h,p]=await Promise.all([
  local('artifacts/country-195/rolling-proof-summary.v1.json'),
  local('artifacts/website-latency/served-samples.json'),
  publicJson('/api/health?deep=1'),publicJson('/api/v1/intelligence/query'),
 ]);
 const report=summarizeLaunchAcceptance({coverage,latency,health:h.body,
  healthStatus:h.status,paymentStatus:p.body});
 await mkdir('artifacts/launch-acceptance',{recursive:true});
 await writeFile('artifacts/launch-acceptance/three-blockers.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 runLaunchAcceptanceReport().catch(()=>{console.error('LAUNCH_ACCEPTANCE_READBACK_UNAVAILABLE');process.exitCode=2;});

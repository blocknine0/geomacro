// Reuse the existing authenticated collector checkpoint, never a partner
// receipt. A successful quiet poll is observable without inventing a release.
const categories=['geopolitics','macro','rare_earth'];
export function fastlaneSourceCheckpoints({reports,supplementary={},published=[],checkedAt}){
 if(!Array.isArray(reports)||!Array.isArray(published)||!Number.isFinite(Date.parse(checkedAt)))throw Error('FASTLANE_SOURCE_CHECK_INVALID');
 return categories.flatMap(category=>{
  const report=reports.find(r=>r.category===category);
  if(!report||!Number.isSafeInteger(report.releases_examined)||report.releases_examined<0)throw Error('FASTLANE_SOURCE_CHECK_INVALID');
  const extra=supplementary[category]??{checks:[],candidates:0};
  const checks=new Map();
  for(const c of [...(report.primary_publisher_status??[]),...(report.fallback_publisher_status??[])])checks.set(c.id,c.reachable===true);
  for(const c of extra.checks??[])checks.set(c.id,['OK','NOT_MODIFIED'].includes(c.state));
  const reachable=[...checks.values()].filter(Boolean).length;
  // An unreachable category keeps its last actual success; another healthy
  // category must never refresh it merely because the run itself was green.
  if(!reachable)return [];
  const examined=report.releases_examined+extra.candidates;
  const accepted=published.filter(s=>s.category===category).length;
  if(!Number.isSafeInteger(examined)||examined<accepted||examined>5000||checks.size>5000)throw Error('FASTLANE_SOURCE_CHECK_INVALID');
  return [{category,body:{status:'DERIVED_NEWS_PUBLISH_COMPLETED',last_attempt_at:checkedAt,last_success_at:checkedAt,cursor:null,
   metadata:{schema:'geomacro.derived-news-source-check.v1',category,checked_at:checkedAt,
    sources_configured:checks.size,sources_reachable:reachable,original_candidates_examined:examined,
    accepted_derived_rows:accepted,raw_upstream_stored:false,commercial_rights_verified:false,paid_delivery_authorized:false}}}];
 });
}
export async function publishFastlaneSourceCheckpoints({reports,supplementary,published,checkedAt,origin,token,fetchImpl=fetch}){
 if(origin!=='https://geomacro-control-plane.daspallab202391.workers.dev'||!/^[a-f0-9]{64}$/.test(token??''))throw Error('FASTLANE_SOURCE_CHECK_CONFIG_INVALID');
 const checkpoints=fastlaneSourceCheckpoints({reports,supplementary,published,checkedAt});
 const results=await Promise.allSettled(checkpoints.map(async ({category,body})=>{
  const r=await fetchImpl(origin+'/v1/checkpoint/website_derived_news_ingest/'+category,{method:'PUT',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const ack=await r.json();
  if(!r.ok||ack.ok!==true||ack.scope!==category||ack.pipeline!=='website_derived_news_ingest')throw Error('FASTLANE_SOURCE_CHECK_NOT_ACKNOWLEDGED');
  return category;
 }));
 if(results.some(r=>r.status==='rejected'))throw Error('FASTLANE_SOURCE_CHECK_NOT_ACKNOWLEDGED');
 return {schema:'geomacro.fastlane-source-checkpoint-receipt.v1',categories:results.map(r=>r.value),checkpoint_writes:checkpoints.length,raw_upstream_stored:false,partner_client_receipt_asserted:false};
}

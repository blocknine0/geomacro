#!/usr/bin/env node
/**
 * Published SHA and three-category combined new open-data API readback.
 * No payment, no secrets, no raw source content or issuer names logged.
 * Exact deployment mismatch aborts before expensive source API reads.
 */
const expected=String(process.env.EXPECTED_CANONICAL_SHA??"").toLowerCase();
const base="https://geomacro.live";
const categories=["geopolitics","macro-fx","critical-minerals"];
async function get(path,limitMs=22_000){
  const res=await fetch(base+path,{method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json","Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(limitMs)});
  if(Number(res.headers.get("content-length")||0)>120_000)return {http:res.status,body:null};
  const raw=await res.text();
  if(raw.length>120_000)return {http:res.status,body:null};
  try{return {http:res.status,body:JSON.parse(raw)};}
  catch{return {http:res.status,body:null};}
}
const summary={schema:"geomacro.category-combined-no-funds-exact-sha.v1",
  expected_sha:expected,deployed_sha:null,exact_shas_match:false,
  paid_actions:0,raw_payload_logged:false,providers_logged:false,
  categories:[],all_categories_accepted:false,commercial_gro_proven:false};
try{
  const marker=await get("/.well-known/geomacro-build.json",9_000);
  const sha=String(marker.body?.canonical_main_sha??"").toLowerCase();
  summary.deployed_sha=/^[a-f0-9]{40}$/u.test(sha)?sha:null;
  summary.exact_shas_match=marker.http===200&&/^[a-f0-9]{40}$/u.test(expected)&&sha===expected;
  if(summary.exact_shas_match){
    summary.categories=await Promise.all(categories.map(async category=>{
      try{
        const response=await get("/api/v1/intelligence/"+category+"?view=combined");
        const data=response.body;
        const original=data?.original_release_observations;
        const typed=data?.structured_open_data;
        const typedFindings=Array.isArray(typed?.findings)?typed.findings:[];
        const news=Array.isArray(original?.findings)?original.findings:[];
        const native=typedFindings.every(row=>row?.evidence_class==="official_open_data_unscored" &&
          ["event_occurrence","catalog_added_day","reference_year","reference_month","award_obligation_day"].includes(row?.clock_semantics)&&
          row?.score===null&&row?.independent_same_event_verification===false);
        const releaseDates=news.every(row=>Number.isFinite(Date.parse(row?.published_at))&&
          Date.now()-Date.parse(row.published_at)>=0&&
          Date.now()-Date.parse(row.published_at)<=86_400_000&&
          row?.risk_score===null&&row?.same_event_corroborated===false);
        const safe=JSON.stringify(typedFindings);
        const noLeak=!/(?:https?:\/\/|www\.|CVE-\d{4}-\d+|us7000)/iu.test(safe);
        const ok=response.http===200 &&
          data?.schema_version==="geomacro.category-combined-coverage.v1"&&
          data?.category===category&&data?.ok===true&&
          data?.signed_gro_generated===false&&data?.chargeable===false&&
          data?.x402_payment_required===false&&
          data?.source_class_count_readable>=1&&
          (!original||original.signed_gro_generated===false)&&
          (!typed||(typed.signed_gro_generated===false&&typed.x402_payment_required===false&&
            typed.chargeable===false&&typed.persistent_storage_written===false))&&
          native&&releaseDates&&noLeak;
        return {category,http:response.http,ok,
          state:ok?data.coverage_status:"COMBINED_COVERAGE_CONTRACT_FAILED",
          source_classes:data?.source_class_count_readable??0,
          news_count:news.length,structured_count:typedFindings.length};
      }catch{return {category,http:0,ok:false,state:"GET_UNAVAILABLE",
        source_classes:0,news_count:0,structured_count:0};}
    }));
  }
}catch{}
summary.all_categories_accepted=summary.exact_shas_match&&
  summary.categories.length===3&&summary.categories.every(x=>x.ok);
console.log(JSON.stringify(summary,null,2));
if(!summary.all_categories_accepted){
  console.error("GEOMACRO_COMBINED_THREE_CATEGORY_PRODUCTION_NOT_PROVEN_NO_FUNDS");
  process.exitCode=2;
}

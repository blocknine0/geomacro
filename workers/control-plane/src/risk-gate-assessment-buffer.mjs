/** Supplementary seven-day hashes only; current pinned GRO verification is
 * repeated before evaluating products. This cache never authorizes delivery,
 * money or execution and is not a replacement for the durable audit ledger. */
import {verifyHotGRO} from './predge-risk-gate-d1.mjs';
import {composeRiskGateThreeTierResponse,RISK_GATE_PRODUCT_TIERS} from './risk-gate-three-tier-product.mjs';
const SHA=/^[a-f0-9]{64}$/;
const iso=n=>new Date(n).toISOString();
async function hash(value){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
/** verifiedRows must come from signedSnapshotRows, including HMAC validation.
 * verifyGro is a private test seam; production callers use the pinned verifier. */
export async function materializeRiskGateAssessments(env,verifiedRows,{
 now=Date.now(),remote,verifyGro=verifyHotGRO,countryIds=null,
}={}){
 if(!Number.isFinite(now)||typeof remote!=='function'||!Array.isArray(verifiedRows))
  throw Error('RISK_ASSESSMENT_INPUT_INVALID');
 const latest=new Map();
 for(const row of verifiedRows){
  if(row.entity_type!=='COUNTRY'||!/^[A-Z]{3}$/.test(row.entity_id))continue;
  if(!latest.has(row.entity_id)||row.day_utc>latest.get(row.entity_id).day_utc)
   latest.set(row.entity_id,row);
 }
 let written=0,currentGro=0,verified=0,insufficient=0;
 const ids=countryIds===null?[...latest.keys()]:[...new Set(countryIds)];
 if(ids.some(id=>!/^[A-Z]{3}$/.test(id)))throw Error('RISK_ASSESSMENT_COUNTRY_INVALID');
 for(let offset=0;offset<ids.length;offset+=50){
  const batch=ids.slice(offset,offset+50),marks=batch.map(()=>'?').join(',');
  const hot=await env.DB.prepare('SELECT * FROM country_gro_verified_hot WHERE country_iso3 IN ('+marks+
   ') AND generated_at<=? AND expires_at>? LIMIT 51').bind(...batch,iso(now),iso(now)).all();
  if(!Array.isArray(hot?.results)||hot.results.length>50)
   throw Error('RISK_ASSESSMENT_HOT_READ_INVALID');
  const good=[];
  for(const row of hot.results){
   if(!batch.includes(row.country_iso3))continue;
   const gro=await verifyGro(row,env,{type:'country',id:row.country_iso3},now);
   if(gro)good.push({row,gro});
  }
  if(!good.length)continue;
  const goodIds=good.map(x=>x.row.country_iso3);
  if(new Set(goodIds).size!==goodIds.length)throw Error('RISK_ASSESSMENT_HOT_DUPLICATE');
  currentGro+=good.length;
  const observed=await env.DB.prepare('SELECT entity_id,category,source_count,evidence_payload FROM risk_observations '+
   'WHERE entity_type=\'COUNTRY\' AND entity_id IN ('+goodIds.map(()=>'?').join(',')+
   ') AND day_utc=? LIMIT 151').bind(...goodIds,iso(now).slice(0,10)).all();
  if(!Array.isArray(observed?.results)||observed.results.length>150)
   throw Error('RISK_ASSESSMENT_OBSERVATION_READ_INVALID');
  const output=[];
  for(const {row,gro} of good){
   // Daily corroboration can be older than this query. This strict cache
   // uses the freshly verified GRO path; it never promotes stale snapshot
   // corroboration into a current Standard assessment.
   const snapshot={...(latest.get(row.country_iso3)?.snapshot??{
    target_type:'COUNTRY',target_id:row.country_iso3,day_utc:iso(now).slice(0,10),categories:{},
   }),corroborated_risk_facts:null};
   const history=verifiedRows.filter(x=>x.entity_type==='COUNTRY'&&x.entity_id===row.country_iso3)
    .map(x=>({...x,proof_verified:true}));
   for(const tier of Object.keys(RISK_GATE_PRODUCT_TIERS)){
    const product=composeRiskGateThreeTierResponse({tier,snapshot,
     observations:observed.results.filter(x=>x.entity_id===row.country_iso3),
     verified_gro:gro,archive_proof:row,history,now});
    const resultSha=await hash(JSON.stringify(product));
    const status=product.status==='READY'&&['VERIFIED','CRYPTO_SIGNED'].includes(product.confidence?.verification)?
     'VERIFIED':'INSUFFICIENT';
    // One mutable operational record per immutable GRO/tier, not a new row
    // on each cron tick. No customer identities, source prose or payment data.
    output.push({assessment_sha256:await hash(JSON.stringify({
     schema:'geomacro.risk-assessment-cache-key.v1',subject:product.subject,
     tier:product.tier,gro:gro.integrity.payload_hash})),
     subject_type:'country',subject_id:row.country_iso3,
     tier:{basic_focused:'BASIC',standard:'STANDARD',complex_full:'COMPLEX'}[tier],
     gro_sha256:gro.integrity.payload_hash,assessment_status:status,
     result_sha256:resultSha,ingested_at:iso(now)});
   }
  }
  for(let index=0;index<output.length;index+=24){
   const chunk=output.slice(index,index+24);
   if(chunk.some(x=>!SHA.test(x.gro_sha256)))throw Error('RISK_ASSESSMENT_GRO_HASH_INVALID');
   await remote('/rest/v1/geomacro_risk_assessment_7d?on_conflict=assessment_sha256',{
    method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(chunk)});
   const found=await (await remote('/rest/v1/geomacro_risk_assessment_7d?select=assessment_sha256,subject_type,subject_id,tier,gro_sha256,assessment_status,result_sha256,ingested_at&assessment_sha256=in.('+
    chunk.map(x=>x.assessment_sha256).join(',')+')&ingested_at=gte.'+encodeURIComponent(iso(now-7*86400000)),{})).json();
   if(!Array.isArray(found)||found.length!==chunk.length||chunk.some(row=>!found.some(value=>
    Object.keys(row).every(key=>key==='ingested_at'?Date.parse(value[key])===now:value[key]===row[key]))))
    throw Error('RISK_ASSESSMENT_EXACT_READBACK_MISMATCH');
   written+=chunk.length;
   verified+=chunk.filter(x=>x.assessment_status==='VERIFIED').length;
   insufficient+=chunk.filter(x=>x.assessment_status==='INSUFFICIENT').length;
  }
 }
 return {assessment_rows:written,current_verified_gro_count:currentGro,
  verified_assessment_rows:verified,insufficient_assessment_rows:insufficient,
  assessment_status:written?'MATERIALIZED_CURRENT_GRO':'BLOCKED_NO_SIGNED_GRO'};
}

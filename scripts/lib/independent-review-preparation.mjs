import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {STAGE_DOMAINS,validatePrivateStageBundle} from './restricted-private-scored-stage.mjs';
import {validatePrivateGriCompanionBundle} from './private-gri-original-publisher-companion.mjs';

const ROOT='geomacro-evidence/v1/private/';
const SHA=/^[a-f0-9]{64}$/u;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('PRIVATE_REVIEW_PREPARATION_'+code);};
export function validateReviewPreparationPins(pins){
 need(pins&&typeof pins==='object'&&!Array.isArray(pins)&&
  Object.keys(pins).sort().join(',')===
   ['schema','source_run_id','source_main_sha','stage_key','stage_sha256','companion_key','companion_sha256'].sort().join(',')&&
  pins.schema==='geomacro.private-review-preparation-source.v1'&&
  /^\d{1,20}$/u.test(String(pins.source_run_id??''))&&
  /^[a-f0-9]{40}$/u.test(String(pins.source_main_sha??''))&&
  SHA.test(pins.stage_sha256??'')&&SHA.test(pins.companion_sha256??'')&&
  pins.stage_key===ROOT+'restricted-current-scoring/'+pins.stage_sha256+'.json.gz'&&
  pins.companion_key===ROOT+'gri-original-source-companions/'+pins.companion_sha256+'.json.gz',
 'SOURCE_PINS_INVALID');
 return pins;
}
function restore(bytes,pin){
 const packed=Buffer.from(bytes);
 need(packed.length>0&&packed.length<=96*1024&&hash(packed)===pin,'SOURCE_BYTES_MISMATCH');
 try{return JSON.parse(gunzipSync(packed,{maxOutputLength:80*1024}).toString('utf8'));}
 catch{throw Error('PRIVATE_REVIEW_PREPARATION_SOURCE_RESTORE_INVALID');}
}

// Assembles REAL already-scored private evidence for a separate reviewer.
// Never creates customer rows, claims, rights receipts, certificates, review
// signatures or historical proof. The public publisher cannot consume this schema.
export function prepareIndependentReviewPackage({pins,stageBytes,companionBytes,now=new Date()}={}){
 validateReviewPreparationPins(pins);
 const at=now instanceof Date?now.getTime():NaN;need(Number.isFinite(at),'CLOCK_INVALID');
 const stage=restore(stageBytes,pins.stage_sha256);
 const companion=restore(companionBytes,pins.companion_sha256);
 validatePrivateStageBundle(stage,{now});
 validatePrivateGriCompanionBundle(companion,stage,{now});
 const missing=STAGE_DOMAINS.filter(domain=>stage.counts[domain]===0);
 const tasks=stage.rows.map(row=>{
  const age=at-Date.parse(row.observed_at);
  return {event_id:row.id,category:row.category,
   source_as_of:row.observed_at,original_age_minutes:Math.floor(age/60000),
   within_intelligence_6h:age>=0&&age<=6*3600000,
   within_gri_90m:age>=0&&age<=90*60000,
   required_review:['FIRST_PARTY_CONTENT_AND_NATIVE_CLOCK','SAME_EVENT_INDEPENDENT_ORIGINALS',
    'SOURCE_RIGHTS_AND_ATTRIBUTION','COUNTEREVIDENCE_AND_RETRACTIONS','COUNTRY_CATEGORY_CERTIFICATION',
    'CANONICAL_SCORE_AND_STORY_BINDING'],
   independent_review_completed:false};
 });
 const blockers=[...missing.map(x=>'MISSING_CATEGORY_'+x.toUpperCase()),
  'INDEPENDENT_ORIGINAL_REVIEW_REQUIRED','SOURCE_RIGHTS_REVIEW_REQUIRED',
  'COUNTRY_CATEGORY_CERTIFICATES_REQUIRED','INDEPENDENT_REVIEW_SIGNATURE_REQUIRED',
  'HISTORICAL_GRI_B2_PIN_AND_READBACK_REQUIRED'];
 if(tasks.some(x=>!x.within_gri_90m))blockers.push('GRI_CURRENT_WINDOW_NOT_MET');
 if(tasks.some(x=>!x.within_intelligence_6h))blockers.push('INTELLIGENCE_CURRENT_WINDOW_NOT_MET');
 const packet={schema:'geomacro.private-independent-review-preparation.v1',
  prepared_at:now.toISOString(),status:'UNSIGNED_REVIEW_PREPARATION',
  private_only:true,reviewer_signed:false,publication_authorized:false,
  commercial_eligible:false,payments_allowed:false,
  source_archive:pins,available_counts:stage.counts,missing_categories:missing,
  publication_blockers:blockers,review_tasks:tasks,
  private_evidence:{stage,original_source_companion:companion}};
 const raw=Buffer.from(JSON.stringify(packet));need(raw.length<=256*1024,'PACKAGE_TOO_LARGE');
 const packed=gzipSync(raw,{level:9}),digest=hash(packed);
 return {packet,raw,packed,key:ROOT+'independent-review-preparation/'+digest+'.json.gz',sha256:digest};
}
export async function archiveIndependentReviewPreparation({pins,archiveClient,now=new Date()}={}){
 validateReviewPreparationPins(pins);
 // One existing governed client shares its attempt budget across both
 // source GETs and the package PUT/readback. No additional B2 clients.
 const stageBytes=await archiveClient.get(pins.stage_key);
 const companionBytes=await archiveClient.get(pins.companion_key);
 const result=prepareIndependentReviewPackage({pins,stageBytes,companionBytes,now});
 await archiveClient.put(result.key,result.packed);
 const readback=Buffer.from(await archiveClient.get(result.key));
 need(readback.equals(result.packed)&&hash(readback)===result.sha256,'PACKAGE_READBACK_MISMATCH');
 need(gunzipSync(readback,{maxOutputLength:256*1024}).equals(result.raw),'PACKAGE_RESTORE_MISMATCH');
 return {schema:'geomacro.private-independent-review-preparation-receipt.v1',
  ok:true,prepared_at:now.toISOString(),status:result.packet.status,
  bucket:'geomacro-private-archive',package_b2_key:result.key,
  package_compressed_sha256:result.sha256,package_payload_sha256:hash(result.raw),
  package_schema:result.packet.schema,package_bytes:result.packed.length,
  available_counts:result.packet.available_counts,missing_categories:result.packet.missing_categories,
  publication_blockers:result.packet.publication_blockers,
  source_archive:pins,source_sha256_readback_verified_now:true,
  package_b2_readback_verified:true,package_exact_gzip_restore_verified:true,
  reviewer_signed:false,publication_authorized:false,public_published:false,
  commercial_eligible:false,payments_executed:0,supabase_requests:0,
  private_source_content_in_receipt:false};
}

#!/usr/bin/env node
import {ORIGINAL_VERIFICATION_WINDOW_MS,ORIGINAL_VERIFICATION_WINDOW_HOURS} from '../../src/lib/original-verification-policy.ts';
import {createHmac} from 'node:crypto';
import {writeFileSync,lstatSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {safeSignedNewsFailureReceipt} from '../lib/signed-news-safe-diagnostic.mjs';
import {pathToFileURL} from 'node:url';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client.ts';
import {automatedInputContent,automatedInputId,inputHash,verifyAutomatedInput} from '../../src/lib/automated-intelligence-input.ts';
const URL='https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/intelligence-publications';
const HEX=/^[a-f0-9]{64}$/;
export function privateNewsProofBearer(env=process.env){
 let low=String(env.GEOMACRO_LOW_REVIEW_TOKEN??"").trim();
 if(!HEX.test(low)){
  const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??env.ROOT_LEDGER_TOKEN??"").trim();
  if(root.length<32)throw Error("PRIVATE_NEWS_PROOF_TOKEN_MISSING");
  const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
  low=createHmac("sha256",control).update("geomacro-low-source-review-v1").digest("hex");
 }
 return createHmac("sha256",low).update("geomacro-internal-news-proof-read-v1").digest("hex");
}
export function storePrivateNewsVerificationReceipt(result,path,env=process.env){
 const base=String(env.RUNNER_TEMP??"");
 if(!base||!isAbsolute(base)||!isAbsolute(path)||
    !resolve(path).startsWith(resolve(base)+"/"))
  throw Error("PRIVATE_NEWS_PROOF_RECEIPT_PATH_NOT_PRIVATE");
 // GitHub runner already uses a private temp dir; enforce 0600 on output.
 writeFileSync(path,JSON.stringify(result)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||
    process.platform!=="win32"&&(stat.mode&0o077)!==0)
  throw Error("PRIVATE_NEWS_PROOF_RECEIPT_NOT_PRIVATE");
}


const TRANSIENT_READ_STATUSES=new Set([408,425,429,500,502,503,504]);
const PUBLIC_READ_ATTEMPTS=3;
const waitBeforeRetry=attempt=>new Promise(resolve=>setTimeout(resolve,100*attempt));
async function fetchSignedNewsPage(url,fetchImpl,proofBearer){
 if(!HEX.test(proofBearer??""))throw Error('PRIVATE_NEWS_PROOF_TOKEN_MISSING');
 for(let attempt=1;attempt<=PUBLIC_READ_ATTEMPTS;attempt++){
  let response;
  try{
   response=await fetchImpl(url,{method:'GET',redirect:'manual',cache:'no-store',
    headers:{Accept:'application/json',Authorization:'Bearer '+proofBearer},signal:AbortSignal.timeout(15000)});
  }catch(error){
   // Redirects are policy failures, not transient transport errors.
   if(error instanceof TypeError&&/redirect/iu.test(error.message))
    throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
   if(attempt===PUBLIC_READ_ATTEMPTS)throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
   await waitBeforeRetry(attempt);continue;
  }
  if(response.redirected===true||(response.status>=300&&response.status<400)){
   try{await response.body?.cancel();}catch{/* discard redirect response */}
   throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
  }
  if(response.status===200)return response;
  if(!TRANSIENT_READ_STATUSES.has(response.status))
   throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
  try{await response.body?.cancel();}catch{/* discard transient response */}
  if(attempt===PUBLIC_READ_ATTEMPTS)throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
  await waitBeforeRetry(attempt);
 }
 throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
}
export function publicationVerificationKeys(env=process.env){
 const keys=JSON.parse(env.RISK_OBJECT_VERIFY_KEYS_JSON||'{}');
 const id=env.RISK_OBJECT_SIGNING_KEY_ID,pub=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
 if(id&&pub){
  const old=keys[id];
  if(old&&(typeof old==='string'?old:old.public_key_spki_b64)!==pub)throw Error('SIGNED_NEWS_KEY_CONFLICT');
  if(!old)keys[id]={public_key_spki_b64:pub,status:'active',
   not_before:env.RISK_OBJECT_SIGNING_KEY_NOT_BEFORE||null,not_after:env.RISK_OBJECT_SIGNING_KEY_NOT_AFTER||null};
 }
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||!Object.keys(keys).length)throw Error('SIGNED_NEWS_REGISTERED_KEYS_REQUIRED');
 return keys;
}
export async function verifyAllNewsSignedPublications({fetchImpl=fetch,keys=publicationVerificationKeys(),now=Date.now(),readJournal=fetchAllDerivedNews,proofBearer=privateNewsProofBearer()}={}){
 // Public proof reads paginate 40 rows while original-news publication runs
 // continue. Pin every page to a deterministic hash of the exact current
 // derived journal; if the journal changes mid-read, restart from a fresh
 // journal at most twice rather than misclassifying valid signatures as bad.
 // A stale canonical bundle envelope can arrive during an edge revision.
 // Permit exactly ONE source-neutral no-cache replay across the entire audit.
 // Quota exhaustion, bad JSON, invalid schemas, expired clocks and forged
 // signatures NEVER receive a successful fallback or unlimited requests.
 let staleJournalRetriesLeft=1;
 attempts: for(let attempt=0;attempt<3;attempt++) {
  let journal;
  try{journal=await readJournal(fetchImpl,now)}
  catch(error){
   if(staleJournalRetriesLeft===0||
      !['DERIVED_NEWS_BUNDLE_STALE_READBACK',
        'DERIVED_NEWS_PAGE_STALE_READBACK'].includes(error?.message))
     throw error;
   staleJournalRetriesLeft--;
   await waitBeforeRetry(1);
   journal=await readJournal(fetchImpl,now);
  }
  const expected=new Set(),contentOrder=new Map();
  for(const signal of journal){
   expected.add(await automatedInputId(signal));
   const content=automatedInputContent(signal);
   if(!contentOrder.has(content))contentOrder.set(content,signal);
  }
  if(expected.size===0||expected.size>600)throw Error('SIGNED_NEWS_NO_RETAINED_INPUT');
  const expectedFingerprint=await inputHash(JSON.stringify([...contentOrder.keys()]));
  const seen=new Set();let signed=0,original=0,current=0,currentEligible=0;
  // Same signed canonical proof page, NO extra D1/HTTP requests. Keep the
  // published release clock separate from the issuer signature and native
  // original-page evidence; these are distinct requirements.
  const byCategory=Object.fromEntries(['geopolitics','macro','rare_earth'].map(
   cat=>[cat,{signed_inputs:0,original_pages_verified:0,
    native_releases_within_60m:0,current_qualified_release_candidates:0,
    current_source_verified_signed:0}]));

  let journalChanged=false;
  for(let offset=0;offset<600;offset+=40){
   const response=await fetchSignedNewsPage(URL+'?offset='+offset,fetchImpl,proofBearer);
   const text=await response.text();if(text.length>500000)throw Error('SIGNED_NEWS_RESPONSE_OVERSIZE');
   let page;
   try{page=JSON.parse(text)}catch{throw Error('SIGNED_NEWS_RESPONSE_JSON_INVALID')}
   if(page.ok!==true||page.schema!=='geomacro.public-signed-derived-news.v1'||
    page.profile!=='GEOMACRO_AUTOMATED_DERIVED_INPUT_V1'||page.page_offset!==offset||page.page_size!==40||
    typeof page.journal_fingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(page.journal_fingerprint)||
    !Number.isSafeInteger(page.unique_items)||!Array.isArray(page.items)||page.items.length<1||page.items.length>40||
    page.legacy_signed_hot_product_equivalent!==false||page.commercial_rights_attested!==false||
    page.scored!==false||page.chargeable!==false)throw Error('SIGNED_NEWS_PAGE_CONTRACT');
   if(page.journal_fingerprint!==expectedFingerprint){
    journalChanged=true;break;
   }
   // A concurrent canonical INSERT/UPDATE can change the unique-item count
   // after the independent first journal read. Never accept a mixed snapshot
   // or mislabel the issuer key as invalid; restart with a fresh journal within
   // the existing strictly bounded three attempts (and fail closed if busy).
   if(page.unique_items!==expected.size){
    journalChanged=true;break;
   }
   for(const item of page.items){
    const id=await automatedInputId(item.signal);
    if(id!==item.input_id||!expected.has(id)||seen.has(id))throw Error('SIGNED_NEWS_IDENTITY_OR_COVERAGE');
    seen.add(id);
    if(item.signature_verified!==true||!item.proof)throw Error('SIGNED_NEWS_ITEM_NOT_SIGNED');
    try{await verifyAutomatedInput(item.proof,keys,now)}
    catch{throw Error('SIGNED_NEWS_SIGNATURE_INVALID')}
    if(await automatedInputId(item.proof.payload.signal)!==id)throw Error('SIGNED_NEWS_PROOF_BINDING');
    const age=now-Date.parse(item.signal.published_at);
    const isCurrent=item.signal.date_precision==='exact'&&age>=0&&age<=60*60_000;
    const qualified=item.signal.status==='official_release_observed_unscored';
    if(item.original_published_at!==item.signal.published_at||
     item.source_current_under_60_minutes!==isCurrent||item.qualified_topic_release!==qualified||
     typeof item.original_page_verified!=='boolean'||
     item.current_source_verified_signed!==(isCurrent&&qualified&&item.original_page_verified)||
     item.commercial_rights_attested!==false||item.independent_reviewed!==false||item.scored!==false||item.chargeable!==false)
     throw Error('SIGNED_NEWS_AUTHORITY_OR_CLOCK');
    const lane=byCategory[item.signal.category];
    if(!lane)throw Error('SIGNED_NEWS_CATEGORY_UNTRUSTED');
    lane.signed_inputs++;
    if(isCurrent)lane.native_releases_within_60m++;
    if(isCurrent&&qualified)lane.current_qualified_release_candidates++;
    if(item.original_page_verified)lane.original_pages_verified++;
    if(item.current_source_verified_signed)lane.current_source_verified_signed++;
    if(item.original_page_verified){
     const at=Date.parse(item.source_reviewed_at??'');
     if(item.source_status!=='ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED'||
      !Number.isFinite(at)||at>now||now-at>ORIGINAL_VERIFICATION_WINDOW_MS||age>ORIGINAL_VERIFICATION_WINDOW_MS)throw Error('SIGNED_NEWS_SOURCE_STATUS');
     original++;
    }
    signed++;if(isCurrent&&qualified)currentEligible++;
    if(item.current_source_verified_signed)current++;
   }
   if(page.next_offset===null){
    if(seen.size!==expected.size)throw Error('SIGNED_NEWS_INCOMPLETE_COVERAGE');
    return {schema:'geomacro.all-news-signed-publication-acceptance.v1',journal_items:journal.length,
     unique_items:expected.size,original_verification_window_hours:ORIGINAL_VERIFICATION_WINDOW_HOURS,exact_signed_inputs_independently_verified:signed,
     all_retained_unique_news_signature_verified:true,original_page_verified_reported:original,
     current_qualified_news:currentEligible,current_source_verified_signed_reported:current,
     all_current_qualified_news_source_verified_signed:currentEligible>0&&current===currentEligible,
     // Explicit release freshness for EACH category. A valid issuer signature
     // does not satisfy native original verification or GRI/paid admission.
     category_original_freshness:Object.fromEntries(Object.entries(byCategory)
      .map(([category,c])=>[category,{...c,
       status:c.current_source_verified_signed>0?'CURRENT_ORIGINAL_SOURCE_PROOF_VERIFIED':
        c.current_qualified_release_candidates>0?'CURRENT_RELEASE_SOURCE_PROOF_PENDING':
        'NO_QUALIFIED_CURRENT_ORIGINAL_RELEASE'}])),
     all_three_categories_current_original_verified:Object.values(byCategory)
       .every(c=>c.current_source_verified_signed>0),
     signed_input_is_not_scored_news:true,
     journal_fingerprint_verified:true,publication_pages_bound_to_same_journal:true,
     journal_restart_attempts:attempt,legacy_signed_hot_3_of_3_verified:false,commercial_rights_attested:false,
     paid_delivery_enabled:false,payments:0};
   }
   if(page.items.length!==40||page.next_offset!==offset+40)throw Error('SIGNED_NEWS_CURSOR');
  }
  if(journalChanged&&attempt<2)continue attempts;
  if(journalChanged)throw Error('SIGNED_NEWS_JOURNAL_CHANGED_REPEATEDLY');
  throw Error('SIGNED_NEWS_PAGE_LIMIT');
 }
 throw Error('SIGNED_NEWS_JOURNAL_CHANGED_REPEATEDLY');
}
// One owner-only recovery for an issuer/publication race. This NEVER
// changes original-page evidence, review verdicts, scored products, PREDGE,
// machine delivery or payment admission. A missing/invalid issuer envelope
// is a failure until the independently verified post-reconciliation read
// actually passes. Every other failure remains a hard failure.
export async function verifySignedNewsWithOwnerReconciliation({
  verify=()=>verifyAllNewsSignedPublications(),
  reconcile=async()=>{
    const {publishAutomatedIntelligenceInputs}=
      await import('./publish-automated-intelligence-inputs.ts');
    return publishAutomatedIntelligenceInputs();
  },
  env=process.env,
}={}){
  try{return await verify()}
  catch(error){
    if(error?.message!=='SIGNED_NEWS_ITEM_NOT_SIGNED'||
       env.GEOMACRO_ALLOW_SIGNED_NEWS_RACE_RECONCILE!=='1'||
       String(env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64??'').length<32||
       String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').length<32||
       !/^[a-f0-9]{40}$/u.test(String(env.GITHUB_SHA??''))||
       !/^\d{1,20}$/u.test(String(env.GITHUB_RUN_ID??'')))
      throw error;
    // Existing publisher already signs derived-only with the registered
    // issuer and exact canonical journal. Do not independently mint a
    // review signature or convert unsigned inputs into verified sources.
    await reconcile();
    return await verify();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const report=await verifySignedNewsWithOwnerReconciliation();
  if(process.env.GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH)
   storePrivateNewsVerificationReceipt(report,process.env.GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH);
  // Public GitHub Actions logs are NOT owner-only. Never print any count,
  // freshness, source-review verdict or publisher metadata to this channel.
  console.log(JSON.stringify({schema:"geomacro.private-news-proof-gate.v1",
   ok:true,details_redacted:true,logged_originals:0,logged_verdicts:0}));
 }catch(error){console.error(JSON.stringify(safeSignedNewsFailureReceipt(error)));process.exitCode=2;}
}

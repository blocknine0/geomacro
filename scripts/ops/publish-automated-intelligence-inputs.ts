import {createHmac} from 'node:crypto';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client';
import {automatedInputId,verifyAutomatedInput,type AutomatedInputEnvelope} from '../../src/lib/automated-intelligence-input';
import {signAutomatedIntelligenceInput,loadRiskObjectVerificationKeysFromEnv} from '../../src/lib/risk-object-signing.server';
import {publishInternalSignedNewsScores} from './publish-internal-signed-news-scores';

const ENDPOINT='https://geomacro-control-plane.daspallab202391.workers.dev/v1/intelligence-inputs/automated';
export async function publishAutomatedIntelligenceInputs({fetchImpl=fetch,env=process.env,now=new Date(),
 readJournal=fetchAllDerivedNews,sign=signAutomatedIntelligenceInput,keys=loadRiskObjectVerificationKeysFromEnv(),
 publishScores=publishInternalSignedNewsScores,
}={}){
 const root=env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'';
 if(root.trim().length<32||!/^\d{1,20}$/.test(env.GITHUB_RUN_ID??'')||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??''))
  throw Error('AUTOMATED_INPUT_PROTECTED_CONFIG_REQUIRED');
 const authorization='Bearer '+createHmac('sha256',root.trim()).update('geomacro-control-plane-v1').digest('hex');
 const call=async(url:string,body?:unknown)=>{
  const r=await fetchImpl(url,{method:body?'PUT':'GET',redirect:'error',cache:'no-store',
   headers:{authorization,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const raw=await r.text();if(raw.length>300000)throw Error('AUTOMATED_INPUT_RESPONSE_OVERSIZE');
  let doc:any;
  try{doc=JSON.parse(raw)}catch{
   if(!r.ok||r.redirected)throw Error('AUTOMATED_INPUT_CONTROL_PLANE_HTTP_'+r.status);
   throw Error('AUTOMATED_INPUT_READBACK_INVALID');
  }
  if(!r.ok||r.redirected){
   const reason=typeof doc?.reason_code==='string'&&/^[A-Z0-9_]{1,96}$/u.test(doc.reason_code)
    ?doc.reason_code:'REMOTE_REJECTED';
   throw Error('AUTOMATED_INPUT_REMOTE_HTTP_'+r.status+'_'+reason);
  }
  if(doc.ok!==true)throw Error('AUTOMATED_INPUT_READBACK_INVALID');return doc;
 };
 const retained=await readJournal(fetchImpl,now.getTime());
 const index=await call(ENDPOINT+'?view=ids');
 if(index.schema!=='geomacro.automated-intelligence-input-feed.v1'||!Array.isArray(index.ids)||
  index.ids.length>600||index.ids.some((s:unknown)=>typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s)))
  throw Error('AUTOMATED_INPUT_INDEX_INVALID');
 const existing=new Set<string>(index.ids),unique=new Map<string,typeof retained[number]>();
 for(const signal of retained)unique.set(await automatedInputId(signal),signal);
 if(unique.size>600)throw Error('AUTOMATED_INPUT_RETAINED_JOURNAL_OVERSIZE');
 const retainedIds=[...unique.keys()];
 let signed=0;
 const pending=[...unique].filter(([id])=>!existing.has(id));
 // Even a no-op run reconciles orphaned revisions from prior journal windows.
 if(pending.length===0){
  const ack=await call(ENDPOINT,{schema:'geomacro.automated-intelligence-input-batch.v1',retained_ids:retainedIds,items:[]});
  if(ack.schema!=='geomacro.automated-intelligence-input-ack.v1'||!Array.isArray(ack.accepted_ids)||ack.accepted_ids.length!==0)
   throw Error('AUTOMATED_INPUT_RECONCILIATION_ACK_INVALID');
 }
 for(let offset=0;offset<pending.length;){
  const group:typeof pending=[],items:AutomatedInputEnvelope[]=[];
  for(const entry of pending.slice(offset,offset+40)){
   const [,signal]=entry;
   const envelope=await sign({schema:'geomacro.automated-intelligence-input.v1',
    approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',
    generated_at:now.toISOString(),expires_at:new Date(Date.parse(signal.published_at)+72*3600_000).toISOString(),
    source_run_id:env.GITHUB_RUN_ID!,source_sha:env.GITHUB_SHA!,signal,
    independent_reviewed:false,commercial_rights_attested:false,scored:false});
   await verifyAutomatedInput(envelope,keys,now.getTime());
   const size=new TextEncoder().encode(JSON.stringify({schema:'geomacro.automated-intelligence-input-batch.v1',
    retained_ids:retainedIds,items:[...items,envelope]})).byteLength;
   if(size>250000){if(!items.length)throw Error('AUTOMATED_INPUT_ITEM_TOO_LARGE');break;}
   items.push(envelope);group.push(entry);
  }
  const ack=await call(ENDPOINT,{schema:'geomacro.automated-intelligence-input-batch.v1',retained_ids:retainedIds,items});
  const expected=group.map(([id])=>id).sort();
  if(ack.schema!=='geomacro.automated-intelligence-input-ack.v1'||!Array.isArray(ack.accepted_ids)||
   JSON.stringify([...ack.accepted_ids].sort())!==JSON.stringify(expected))throw Error('AUTOMATED_INPUT_ACK_MISMATCH');
  signed+=items.length;offset+=items.length;
 }
 const after=await call(ENDPOINT+'?view=ids');
 if(after.schema!=='geomacro.automated-intelligence-input-feed.v1'||!Array.isArray(after.ids)||
  [...unique.keys()].some(id=>!after.ids.includes(id)))throw Error('AUTOMATED_INPUT_PERSISTENCE_INCOMPLETE');
 // Reuse this exact validated 72-hour journal, the existing producer signer
 // and the same protected D1. No second public/D1 read and no new cron.
 // Every input gets an independent domain-separated internal score signature.
 const scored=await publishScores({signals:retained,fetchImpl,env,now,keys});
 if(scored.all_retained_inputs_signed_scored!==true||
  scored.unique_source_inputs!==unique.size)
  throw Error('AUTOMATED_INPUT_SCORE_COVERAGE_MISMATCH');
 return {schema:'geomacro.automated-intelligence-input-run.v1',
  internal_scored_news:scored,retained_items:retained.length,
  unique_items:unique.size,duplicates_excluded:retained.length-unique.size,
  already_signed:unique.size-pending.length,new_signed_inputs:signed,
  all_retained_unique_inputs_present:true,manual_approval_required:false,
  independent_reviewed:false,commercial_rights_attested:false,
  b2_requests:0,supabase_requests:0,payments:0};
}
export function safeAutomatedInputPublicationFailure(error:unknown){
 const message=error instanceof Error?error.message:'';
 return /^AUTOMATED_INPUT_[A-Z0-9_]{1,160}$/u.test(message)
  ?message:'AUTOMATED_INPUT_UNCLASSIFIED_SIGNER_OR_TRANSPORT_FAILURE';
}
if(import.meta.main){
 try{console.log(JSON.stringify(await publishAutomatedIntelligenceInputs()));}
 catch(error){console.error('::error::'+safeAutomatedInputPublicationFailure(error));process.exitCode=2;}
}

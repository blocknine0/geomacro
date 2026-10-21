import {createHmac} from 'node:crypto';
import {lstatSync,readFileSync} from 'node:fs';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client.ts';
import {automatedInputId} from '../../src/lib/automated-intelligence-input.ts';
import {canonicalizePrivateOriginalSourceClock} from '../../src/lib/private-source-handoff.ts';
import type {StatelessSourceCandidate} from '../../src/lib/stateless-intelligence-model.ts';
const endpoint='https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/source-handoffs';
export function readPrivateSourceRefs(env=process.env){
 const path=env.GEOMACRO_LOW_REVIEW_REFS_FILE,temp=env.RUNNER_TEMP;
 if(!path||!temp||!path.startsWith(temp+'/')||path.includes('/../'))throw Error('PRIVATE_HANDOFF_PATH_INVALID');
 let stat;try{stat=lstatSync(path)}catch(error:any){if(error.code==='ENOENT')return new Map<string,StatelessSourceCandidate>();throw error;}
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>2_000_000)throw Error('PRIVATE_HANDOFF_FILE_INVALID');
 const body=JSON.parse(readFileSync(path,'utf8'));
 if(!body||Object.keys(body).join(',')!=='refs'||!Array.isArray(body.refs)||body.refs.length>600||
  body.refs.some((r:any)=>!Array.isArray(r)||r.length!==2||typeof r[0]!=='string'))throw Error('PRIVATE_HANDOFF_FILE_INVALID');
 return new Map<string,StatelessSourceCandidate>(body.refs);
}
export async function persistPrivateSourceHandoffs({refs,env=process.env,fetchImpl=fetch,readJournal=fetchAllDerivedNews,now=new Date()}:{
 refs:Map<string,StatelessSourceCandidate>;env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;
 readJournal?:typeof fetchAllDerivedNews;now?:Date;
}){
 const root=(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
 if(root.length<32)throw Error('PRIVATE_HANDOFF_WRITER_CONFIG_REQUIRED');
 const token=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
 const signals=await readJournal(fetchImpl,now.getTime()),items=new Map();
 if(!refs.size)return {schema:'geomacro.private-source-handoff-run.v1',references_accepted:0,
  public_sources_disclosed:false,source_evidence_verified:false,commercial_rights_attested:false,
  b2_requests:0,supabase_requests:0,payments:0};
 const indexResponse=await fetchImpl(endpoint.replace('/internal/source-handoffs','/intelligence-inputs/automated')+'?view=handoff-ids',{
  redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!indexResponse.ok||indexResponse.redirected)throw Error('PRIVATE_HANDOFF_INDEX_HTTP_'+indexResponse.status);
 const rawIndex=await indexResponse.text();if(rawIndex.length>150000)throw Error('PRIVATE_HANDOFF_INDEX_OVERSIZE');
 const index=JSON.parse(rawIndex);
 if(index.ok!==true||index.schema!=='geomacro.automated-intelligence-input-feed.v1'||
  !Array.isArray(index.handoffs)||index.handoffs.length>600||index.handoffs.some((x:any)=>
   !/^[a-f0-9]{64}$/.test(x?.input_id??'')||!/^(geopolitics|macro|rare_earth)-[a-f0-9]{8}$/.test(x?.signal_id??'')))
  throw Error('PRIVATE_HANDOFF_INDEX_INVALID');
 const canonicalIds=new Map<string,string>(index.handoffs.map((x:any)=>[x.input_id,x.signal_id]));
 let equivalentNativeClocksCanonicalized=0;
 for(const signal of signals){const original=refs.get(signal.id);if(original){
  const input_id=await automatedInputId(signal);
  if(canonicalIds.get(input_id)===signal.id&&!items.has(input_id)){
   const ref=canonicalizePrivateOriginalSourceClock(original,signal);
   if(ref!==original)equivalentNativeClocksCanonicalized++;
   items.set(input_id,{input_id,ref});
  }
 }}
 const all=[...items.values()];
 for(let offset=0;offset<all.length;){
  const group=[];
  for(const item of all.slice(offset,offset+40)){
   if(new TextEncoder().encode(JSON.stringify({items:[...group,item]})).byteLength>250000){
    if(!group.length)throw Error('PRIVATE_HANDOFF_BATCH_OVERSIZE');break;
   }
   group.push(item);
  }
  const body=JSON.stringify({items:group});
  const response=await fetchImpl(endpoint,{method:'PUT',redirect:'error',cache:'no-store',
   headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000)});
  if(!response.ok||response.redirected){
   if(response.status===400){
    // Only bounded category codes are printed. Never log response bodies,
    // original URLs, article titles, upstream IDs or signer details.
    let reason='REJECTED_UNCLASSIFIED';
    try{
     const raw=await response.text();
     if(raw.length<=1000){
      const doc=JSON.parse(raw);
      if(doc?.error==='PRIVATE_HANDOFF_NOT_VERIFIED'&&
       /^(?:SIGNED_INPUT_NOT_PRESENT|HANDOFF_ID_OR_SHAPE|ORIGINAL_REFERENCE_FORMAT|ORIGINAL_REFERENCE_SHAPE|ORIGINAL_REFERENCE_CLOCK|ORIGINAL_REFERENCE_URL|SIGNED_SIGNAL_ORIGINAL_BINDING|SIGNED_INPUT_STALE_OR_CLOCK|SIGNED_INPUT_STORY_OR_EMBARGO|SIGNED_INPUT_ENVELOPE|SIGNED_INPUT_CONTRACT|SIGNER_KEY_NOT_APPROVED|SIGNER_KEY_TIME_WINDOW|SIGNER_SIGNATURE|QUERY_INVALID|PAYLOAD_TOO_LARGE|PAYLOAD_SHAPE|INPUT_IDENTITY|INPUT_COLLISION|D1_STORED_BINDING|D1_READ|D1_WRITE|UNCLASSIFIED_VALIDATION_OR_STORE)$/u.test(doc.reason_code??''))
       reason=doc.reason_code;
     }
    }catch{/* Response text and transport error details must stay private. */}
    throw Error('PRIVATE_HANDOFF_WRITE_REJECTED_'+reason);
   }
   throw Error('PRIVATE_HANDOFF_WRITE_HTTP_'+response.status);
  }
  const raw=await response.text();if(raw.length>10000)throw Error('PRIVATE_HANDOFF_ACK_INVALID');
  const ack=JSON.parse(raw);
  if(ack.ok!==true||!Array.isArray(ack.accepted_ids)||
   JSON.stringify([...ack.accepted_ids].sort())!==JSON.stringify(group.map(x=>x.input_id).sort()))
   throw Error('PRIVATE_HANDOFF_ACK_INVALID');
  offset+=group.length;
 }
 // Counts only. Original titles/URLs, internal IDs and LOW verdicts are private.
 return {schema:'geomacro.private-source-handoff-run.v1',references_accepted:all.length,
  equivalent_native_clock_representations_normalized:equivalentNativeClocksCanonicalized,
  public_sources_disclosed:false,source_evidence_verified:false,commercial_rights_attested:false,
  b2_requests:0,supabase_requests:0,payments:0};
}
if(import.meta.main){
 try{console.log(JSON.stringify(await persistPrivateSourceHandoffs({refs:readPrivateSourceRefs()})))}
 catch(error){
  // Controlled stage/status only: never print private publisher URL, title,
  // article hash, token, HTTP response body or untrusted exception text.
  const message=error instanceof Error?error.message:'';
  const safe=/^(?:PRIVATE_HANDOFF_[A-Z0-9_]+|DERIVED_NEWS_[A-Z0-9_]+)$/u.test(message)
   ?message:'PRIVATE_HANDOFF_UNCLASSIFIED_TRANSPORT_OR_BINDING_ERROR';
  console.error('::error::'+safe);process.exitCode=2;
 }
}

/** Private sidecar to the existing qualified source pipeline. Immutable
 * unsigned inputs are staged; the signer independently repeats qualification. */
import {canonicalRiskObjectJson} from '../../src/lib/risk-object-signing.server';
import {createHash} from 'node:crypto';
import {createB2Client} from './b2-s3-client.mjs';
import {createSigningJobDb,enqueueSigningJob} from '../lib/gro-auto-signing-jobs.mjs';
import {validatedSnapshot} from '../../src/lib/on-demand-qualified-country-risk.server';
import {parsePrivateMachineCommercialCountryRequest,parsePrivateMachineCommercialRequest} from './accept-private-geomacro-machine-commercial-gro';
import {isHot50RiskCountry} from '../../workers/control-plane/src/risk-gate-hot50-scope.mjs';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function stageAutomaticGroInputs({input,qualified,env=process.env,now=new Date(),
 archiveClient=()=>createB2Client({endpointUrl:'https://s3.us-east-005.backblazeb2.com',bucket:'geomacro-private-archive',accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY}),
 db=createSigningJobDb({env}),
}:{input:any;qualified:any;env?:NodeJS.ProcessEnv;now?:Date;archiveClient?:()=>any;db?:any}){
 if(qualified?.receipt?.commercial_event_admission!==true||!Array.isArray(qualified.receipt.qualified)||
    !Array.isArray(input.eventPackages))throw Error('GRO_AUTO_STAGE_QUALIFICATION_REQUIRED');
 const summary={enabled:true,enqueued:0,incomplete_country_groups:0,failed:0,
  full_country_requests:0,single_category_requests:0};
 const groups=new Map<string,any[]>();
 for(const pkg of input.eventPackages){
  if(!isHot50RiskCountry(pkg.country_iso3))continue;
  const snapshot=validatedSnapshot({category:pkg.category,country_iso3:pkg.country_iso3,events:[pkg.event]},now);
  if(!qualified.receipt.qualified.some((r:any)=>r.event_id===pkg.event.id&&r.category===pkg.category&&
     r.country_iso3===pkg.country_iso3&&r.exact_evidence_sha256===snapshot.sha256))
   throw Error('GRO_AUTO_STAGE_EXACT_EVIDENCE_MISMATCH');
  groups.set(pkg.country_iso3,[...(groups.get(pkg.country_iso3)??[]),pkg]);
 }
 const part=(pkg:any)=>({schema:'geomacro.private-machine-commercial-request.v1',category:pkg.category,
  country_iso3:pkg.country_iso3,event:pkg.event,candidates:pkg.candidates,envelope:pkg.envelope});
 const archive=async(request:any,b2:any)=>{
  if(request.schema==='geomacro.private-machine-commercial-country-request.v1')
   request={...request,parts:[...request.parts].sort((a:any,b:any)=>a.category.localeCompare(b.category))};
  const bytes=canonicalRiskObjectJson(request);
  if(Buffer.byteLength(bytes)>1024*1024)throw Error('GRO_AUTO_STAGE_OVERSIZE');
  const sha256=digest(bytes),key='geomacro-evidence/v1/private/machine-gro-qualified/'+sha256+'.json';
  // A content-addressed immutable PUT plus one exact readback. Repeating
  // identical bytes cannot replace a different payload at this SHA key.
  await b2.putWithMetadataVerification(key,Buffer.from(bytes),{verifyRestored:async(restored:Buffer)=>{
   if(restored.toString('utf8')!==bytes)throw Error('GRO_AUTO_STAGE_READBACK_FAILED');
  }});
  return {sha256,key};
 };
 const remember=async(parts:any[],pin:{sha256:string;key:string})=>{
  for(const p of parts)await db.query("INSERT INTO gro_auto_signing_category_inputs(country_iso3,category,input_sha256,b2_key,source_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(country_iso3,category) DO UPDATE SET input_sha256=excluded.input_sha256,b2_key=excluded.b2_key,source_at=excluded.source_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE excluded.source_at>=gro_auto_signing_category_inputs.source_at",
   [p.country_iso3,p.category,pin.sha256,pin.key,new Date(p.event.last_seen_at).toISOString(),new Date(p.envelope.proof.expires_at).toISOString(),now.toISOString()]);
 };
 for(const [country,packages] of groups){
  const batches=packages.length===3&&new Set(packages.map(x=>x.category)).size===3?[packages]:packages.map(x=>[x]);
  for(const batch of batches)try{
   const b2=archiveClient();
   let parts=batch.map(part),request:any=parts.length===3?
    {schema:'geomacro.private-machine-commercial-country-request.v1',parts}:parts[0];
   if(parts.length===3)parsePrivateMachineCommercialCountryRequest(JSON.stringify(request));
   else parsePrivateMachineCommercialRequest(JSON.stringify(request));
   let pin=await archive(request,b2);
   await remember(parts,pin);
   if(parts.length===1){
    const refs=await db.query("SELECT category,input_sha256,b2_key FROM gro_auto_signing_category_inputs WHERE country_iso3=? AND expires_at>? ORDER BY category",[country,now.toISOString()]);
    if(refs.length===3&&new Set(refs.map((r:any)=>r.category)).size===3){
     const cached=new Map<string,any>([[pin.key,request]]),assembled:any[]=[];
     for(const ref of refs){
      if(!/^[a-f0-9]{64}$/.test(ref.input_sha256)||ref.b2_key!=='geomacro-evidence/v1/private/machine-gro-qualified/'+ref.input_sha256+'.json')
       throw Error('GRO_AUTO_STAGE_POOL_PIN_INVALID');
      if(!cached.has(ref.b2_key)){
       const bytes=Buffer.from(await b2.get(ref.b2_key)).toString('utf8');
       if(digest(bytes)!==ref.input_sha256)throw Error('GRO_AUTO_STAGE_POOL_HASH_INVALID');
       cached.set(ref.b2_key,JSON.parse(bytes));
      }
      const value=cached.get(ref.b2_key);
      const candidate=value.schema==='geomacro.private-machine-commercial-country-request.v1'?
       value.parts.find((p:any)=>p.category===ref.category):value;
      if(candidate?.category!==ref.category||candidate.country_iso3!==country)throw Error('GRO_AUTO_STAGE_POOL_SUBJECT_INVALID');
      assembled.push(candidate);
     }
     request={schema:'geomacro.private-machine-commercial-country-request.v1',parts:assembled};
     parsePrivateMachineCommercialCountryRequest(JSON.stringify(request));
     parts=assembled;pin=await archive(request,b2);
     await remember(parts,pin);
    }else summary.incomplete_country_groups++;
   }
   const expires_at=parts.map(x=>new Date(x.envelope.proof.expires_at).toISOString()).sort()[0];
   await enqueueSigningJob(db,{...pin,country_iso3:country,expires_at},now.getTime());
   summary.enqueued++;
   if(parts.length===3)summary.full_country_requests++;else summary.single_category_requests++;
  }catch{summary.failed++;}
 }
 return summary;
}

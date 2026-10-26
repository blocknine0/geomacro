import {automatedInputId,verifyAutomatedInput,type AutomatedInputEnvelope} from './automated-intelligence-input.ts';
import type {StatelessSourceCandidate} from './stateless-intelligence-model.ts';

// Finite topic only, never retained article text or an independent rights/fact
// attestation. It must remain bound to the NRCan original-day collector.
export function privateOriginalBodyTopicShapeValid(ref:StatelessSourceCandidate):boolean{
 if(!ref||typeof ref!=="object"||Array.isArray(ref))return false;
 if(!Object.prototype.hasOwnProperty.call(ref,"originalBodyTopic"))return true;
 return ref.sourceId==="nrcan_releases"&&ref.category==="rare_earth"&&
  ref.datePrecision==="day"&&typeof ref.publishedAt==="string"&&
  /^20\d{2}-\d{2}-\d{2}$/u.test(ref.publishedAt)&&
  typeof ref.articleUrl==="string"&&
  /^https:\/\/www\.canada\.ca\/en\/natural-resources-canada\/news\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]+\.html$/u.test(ref.articleUrl)&&
  ["critical-minerals policy","mineral exploration and production"].includes(ref.originalBodyTopic??"");
}

// A native RSS pubDate can be RFC 2822 while the signed derived journal
// stores the exact same instant in UTC ISO form. Normalize representation
// ONLY when both parsed clocks agree exactly; never supply an inferred hour
// for day-only inputs, change original event time, or bypass byte readback.
export function canonicalizePrivateOriginalSourceClock(
  ref:StatelessSourceCandidate,signal:{published_at:string;date_precision:string}
):StatelessSourceCandidate{
 if(!ref||!signal||ref.publishedAt===signal.published_at)return ref;
 if(signal.date_precision!=='exact'||typeof ref.publishedAt!=='string'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(signal.published_at))
   return ref;
 const original=Date.parse(ref.publishedAt),signed=Date.parse(signal.published_at);
 if(!Number.isFinite(original)||!Number.isFinite(signed)||original!==signed)return ref;
 return {...ref,publishedAt:signal.published_at};
}

export type PrivateSourceHandoff={input_id:string;ref:StatelessSourceCandidate};
export async function verifyPrivateSourceHandoff(item:PrivateSourceHandoff,input:AutomatedInputEnvelope,
 keys:Parameters<typeof verifyAutomatedInput>[1],now=Date.now()){
 if(!item||Object.keys(item).sort().join(',')!=='input_id,ref'||!/^[a-f0-9]{64}$/.test(item.input_id))
  throw Error('PRIVATE_SOURCE_HANDOFF_INVALID');
 await verifyAutomatedInput(input,keys,now);
 const r=item.ref;
 if(!r||typeof r!=='object'||Array.isArray(r)||
  Object.keys(r).some(k=>!['title','articleUrl','publishedAt','datePrecision','sourceId','category','credit','originalBodyTopic','description'].includes(k))||
  !privateOriginalBodyTopicShapeValid(r)||
  (r.description!==undefined&&(typeof r.description!=="string"||r.description.length>1500||
    /[<>]|https?:\/\/|www\./iu.test(r.description)))||
  typeof r.title!=='string'||r.title.length<1||r.title.length>2000||
  typeof r.articleUrl!=='string'||r.articleUrl.length>2048||
  typeof r.sourceId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(r.sourceId)||
  !(r.credit===null||typeof r.credit==='string'&&r.credit.length<=1000)||
  r.category!==input.payload.signal.category)
  throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_SHAPE_INVALID');
 if(r.publishedAt!==input.payload.signal.published_at)
  throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_CLOCK_INVALID');
 let u:URL;
 try{u=new URL(r.articleUrl)}catch{throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_URL_INVALID')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.href!==r.articleUrl)
  throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_URL_INVALID');
 // Reproduce the exact derived content, rather than accepting an arbitrary
 // URL attached to an approved input. This is provenance, NOT source approval.
 const {deriveStatelessSignals}=await import('./stateless-intelligence-model.ts');
 // Preserve exact validation of already-signed pre-editorial-update inputs.
 // New output uses actor/action v2; no existing signature or payload is edited.
 const candidates=[deriveStatelessSignals([r],now)[0],
  deriveStatelessSignals([r],now,{editorialVersion:'actor_action_v2'})[0],
  deriveStatelessSignals([r],now,{editorialVersion:'legacy_v1'})[0]];
 let bound=false;
 for(const derived of candidates){
  if(derived&&derived.id===input.payload.signal.id&&await automatedInputId(derived)===item.input_id)bound=true;
 }
 if(!bound||await automatedInputId(input.payload.signal)!==item.input_id)
  throw Error('PRIVATE_SOURCE_HANDOFF_BINDING_INVALID');
 return {schema:'geomacro.private-source-handoff.v1' as const,...item,
  expires_at:input.payload.expires_at};
}

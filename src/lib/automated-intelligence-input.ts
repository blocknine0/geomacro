import {canonicalJson} from './canonical-json.ts';
import {checkedDerivedNews} from './public-derived-news-client.ts';
import type {StatelessIntelligenceSignal} from './stateless-intelligence-model.ts';

export const AUTOMATED_INPUT_DOMAIN='geomacro.automated-intelligence-input.v1\n';
export type AutomatedInputPayload={
 schema:'geomacro.automated-intelligence-input.v1';
 approval_mode:'AUTOMATED_INGESTION'; approved_for:'derived_intelligence_input';
 generated_at:string; expires_at:string; source_run_id:string; source_sha:string;
 independent_reviewed:false; commercial_rights_attested:false; scored:false;
 signal:StatelessIntelligenceSignal;
};
export type AutomatedInputEnvelope={payload:AutomatedInputPayload;integrity:{
 signing_key_id:string; signature_scheme:'ed25519';
 canonicalization:'geomacro-canonical-json-v1';payload_sha256:string;signature:string;
}};
type Keys=Record<string,string|{public_key_spki_b64:string;status?:string;not_before?:string|null;not_after?:string|null}>;
const exact=(v:object,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export const inputHash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export function assertAutomatedInput(p:AutomatedInputPayload,now=Date.now()){
 if(!p||!exact(p,['schema','approval_mode','approved_for','generated_at','expires_at',
  'source_run_id','source_sha','independent_reviewed','commercial_rights_attested','scored','signal'])||
  p.schema!=='geomacro.automated-intelligence-input.v1'||p.approval_mode!=='AUTOMATED_INGESTION'||
  p.approved_for!=='derived_intelligence_input'||p.independent_reviewed!==false||
  p.commercial_rights_attested!==false||p.scored!==false||
  !/^\d{1,20}$/.test(p.source_run_id)||!/^[a-f0-9]{40}$/.test(p.source_sha))
  throw Error('AUTOMATED_INPUT_CONTRACT_INVALID');
 const generated=Date.parse(p.generated_at),expiry=Date.parse(p.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(generated)||generated>now||
  new Date(generated).toISOString()!==p.generated_at||!Number.isFinite(expiry)||expiry<=now||
  expiry!==Date.parse(p.signal?.published_at)+72*3600_000||generated>=expiry)
  throw Error('AUTOMATED_INPUT_CLOCK_INVALID');
 // Reuse the existing derived-only, native-clock, delayed journal contract.
 for(const clock of [generated,now]){
  const rows=checkedDerivedNews({ok:true,schema:'geomacro.website-derived-news-feed.v1',
   original_release_delay_minutes:0,retention_days:3,retention_hours:72,
   delivery_scope:'free_website_only',signals:[p.signal]},clock);
  if(rows.length!==1)throw Error('AUTOMATED_INPUT_STORY_INVALID');
 }
}
export function automatedInputSignable(p:AutomatedInputPayload){return AUTOMATED_INPUT_DOMAIN+canonicalJson(p);}
// Native time/category and exact derived content define identity. Alternate
// journal IDs cannot duplicate the same input; changed content is a revision.
export function automatedInputContent(signal:StatelessIntelligenceSignal){
 const {id:_,...content}=signal;
 return canonicalJson(content);
}
export async function automatedInputId(signal:StatelessIntelligenceSignal){
 return inputHash(automatedInputContent(signal));
}
export async function verifyAutomatedInput(e:AutomatedInputEnvelope,keys:Keys,now=Date.now()){
 if(!e||!exact(e,['payload','integrity'])||!e.integrity||
  !exact(e.integrity,['signing_key_id','signature_scheme','canonicalization','payload_sha256','signature']))
  throw Error('AUTOMATED_INPUT_ENVELOPE_INVALID');
 assertAutomatedInput(e.payload,now);
 const i=e.integrity;
 if(i.signature_scheme!=='ed25519'||i.canonicalization!=='geomacro-canonical-json-v1'||
  !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(i.signing_key_id)||
  !/^[a-f0-9]{64}$/.test(i.payload_sha256)||!/^[A-Za-z0-9+/]{86}==$/.test(i.signature)||
  !Object.prototype.hasOwnProperty.call(keys,i.signing_key_id))throw Error('AUTOMATED_INPUT_KEY_INVALID');
 const raw=keys[i.signing_key_id],key=typeof raw==='string'?{public_key_spki_b64:raw}:raw;
 const generated=Date.parse(e.payload.generated_at);
 if(!key||![undefined,'active','retired'].includes(key.status)||
  (key.not_before&&(!Number.isFinite(Date.parse(key.not_before))||generated<Date.parse(key.not_before)))||
  (key.not_after&&(!Number.isFinite(Date.parse(key.not_after))||generated>Date.parse(key.not_after))))
  throw Error('AUTOMATED_INPUT_KEY_LIFECYCLE_INVALID');
 const text=automatedInputSignable(e.payload),bytes=new TextEncoder().encode(text);
 const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const pub=await crypto.subtle.importKey('spki',decode(key.public_key_spki_b64),{name:'Ed25519'},false,['verify']);
 if(i.payload_sha256!==await inputHash(text)||!await crypto.subtle.verify('Ed25519',pub,decode(i.signature),bytes))
  throw Error('AUTOMATED_INPUT_SIGNATURE_INVALID');
}

/**
 * Every currently retained canonical derived-news input receives a separate
 * issuer-signed INTERNAL TRIAGE SCORE. A score is not independent factual
 * validation, a current numerical GRI, or customer deliverability.
 *
 * The input ID binds the complete canonical derived content (not just a title)
 * and the private D1 storage endpoint rechecks the source signed input.
 */
import {canonicalJson} from "./canonical-json.ts";
import {automatedInputId,inputHash} from "./automated-intelligence-input.ts";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model.ts";

export const INTERNAL_NEWS_SCORE_SCHEMA="geomacro.internal-signed-news-score.v1";
export const INTERNAL_NEWS_SCORE_DOMAIN=INTERNAL_NEWS_SCORE_SCHEMA+"\n";
export const INTERNAL_NEWS_SCORE_RUBRIC="private-event-triage-v1";
export const INTERNAL_NEWS_SCORE_CLASSES=["geopolitics","macro","rare_earth"] as const;
const categoryNames=new Set<string>(INTERNAL_NEWS_SCORE_CLASSES);
const statusNames=new Set([
 "official_release_observed_unscored",
 "official_feed_candidate_unscored",
 "osint_feed_observed_unverified"
]);
const fields=["schema","scope","scored","independent_reviewed","commercial_rights_attested",
 "customer_eligible","numerical_gri_authorized","category","source_status",
 "input_id","source_published_at","date_precision","generated_at","expires_at",
 "rubric","intelligence_score","triage_confidence_score","urgency_band","risk_score",
 "source_run_id","source_sha"];
const exact=(o:unknown,names:string[]):o is Record<string,unknown>=>!!o&&
 typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).sort().join(",")===names.slice().sort().join(",");

export type InternalNewsScorePayload={
 schema:typeof INTERNAL_NEWS_SCORE_SCHEMA;scope:"GEOMACRO_INTERNAL_RESEARCH_ONLY";
 scored:true;independent_reviewed:false;commercial_rights_attested:false;
 customer_eligible:false;numerical_gri_authorized:false;
 category:"geopolitics"|"macro"|"rare_earth";
 source_status:"official_release_observed_unscored"|"official_feed_candidate_unscored"|"osint_feed_observed_unverified";
 input_id:string;source_published_at:string;date_precision:"day"|"exact";
 generated_at:string;expires_at:string;rubric:typeof INTERNAL_NEWS_SCORE_RUBRIC;
 intelligence_score:number;triage_confidence_score:number;
 urgency_band:"HIGH"|"MEDIUM"|"LOW";risk_score:null;
 source_run_id:string;source_sha:string;
};
export type InternalNewsScoreEnvelope={
 payload:InternalNewsScorePayload;
 integrity:{signing_key_id:string;signature_scheme:"ed25519";
 canonicalization:"geomacro-canonical-json-v1";payload_sha256:string;signature:string};
};
type Keys=Record<string,string|{public_key_spki_b64:string;status?:string;
 not_before?:string|null;not_after?:string|null}>;

/** Calibrated *research triage priority*, not a factual risk/severity assertion. */
export function internalNewsTriage(signal:Pick<StatelessIntelligenceSignal,"category"|"development_type"|"status">){
 const category=String(signal?.category??""),status=String(signal?.status??"");
 if(!categoryNames.has(category)||!statusNames.has(status))
  throw Error("INTERNAL_NEWS_SCORE_CATEGORY_OR_STATUS_INVALID");
 const development=String(signal.development_type??"").toLowerCase().trim();
 if(development.length>80||!development)throw Error("INTERNAL_NEWS_SCORE_DEVELOPMENT_INVALID");
 // These category-relevant action terms are intentionally fixed and versioned.
 // The deterministic priority never purports to know magnitude/market impact.
 const weights:Record<string,number>={
  "trade restriction":27,"monetary policy":25,"security":24,
  "trade policy":22,"price data":20,"risk update":18,
  "production":18,"approval":16,"funding":15,"agreement":14,
 };
 const base:Record<string,number>={geopolitics:35,macro:35,rare_earth:35};
 const candidate=status==="official_feed_candidate_unscored";
 const osint=status==="osint_feed_observed_unverified";
 const term=Object.keys(weights).find(t=>development===t);
 // Unknown development types are still scored and retained, not dropped.
 const score=Math.max(0,Math.min(100,base[category]+(term?weights[term]:5)-
  (candidate?24:0)-(osint?32:0)));
 return {
  intelligence_score:score,
  triage_confidence_score:osint?10:candidate?15:35,
  urgency_band:(score>=60?"HIGH":score>=40?"MEDIUM":"LOW") as "HIGH"|"MEDIUM"|"LOW"
 };
}
export function makeInternalNewsScorePayload(signal:StatelessIntelligenceSignal,{
 inputId,generatedAt,runId,sha
}:{inputId:string;generatedAt:string;runId:string;sha:string}):InternalNewsScorePayload{
 if(!/^[a-f0-9]{64}$/.test(inputId)||!/^\d{1,20}$/.test(runId)||
   !/^[a-f0-9]{40}$/.test(sha))throw Error("INTERNAL_NEWS_SCORE_LINEAGE_INVALID");
 const native=Date.parse(String(signal?.published_at??"")),generated=Date.parse(generatedAt);
 if(!Number.isFinite(native)||!Number.isFinite(generated)||generated<native||
   generated>=native+72*3_600_000||
   new Date(generated).toISOString()!==generatedAt)
  throw Error("INTERNAL_NEWS_SCORE_CLOCK_INVALID");
 if(signal.date_precision!=="day"&&signal.date_precision!=="exact")
  throw Error("INTERNAL_NEWS_SCORE_PRECISION_INVALID");
 return {
  schema:INTERNAL_NEWS_SCORE_SCHEMA,scope:"GEOMACRO_INTERNAL_RESEARCH_ONLY",
  scored:true,independent_reviewed:false,commercial_rights_attested:false,
  customer_eligible:false,numerical_gri_authorized:false,
  category:signal.category,source_status:signal.status,
  input_id:inputId,source_published_at:signal.published_at,
  date_precision:signal.date_precision,
  generated_at:generatedAt,expires_at:new Date(native+72*3_600_000).toISOString(),
  rubric:INTERNAL_NEWS_SCORE_RUBRIC,...internalNewsTriage(signal),risk_score:null,
  source_run_id:runId,source_sha:sha
 };
}
export const internalNewsScoreSignable=(p:InternalNewsScorePayload)=>
 INTERNAL_NEWS_SCORE_DOMAIN+canonicalJson(p);

export async function verifyInternalNewsScore(e:InternalNewsScoreEnvelope,keys:Keys,now=Date.now(),
 original?:StatelessIntelligenceSignal){
 if(!exact(e,["payload","integrity"])||!exact(e.integrity,
   ["signing_key_id","signature_scheme","canonicalization","payload_sha256","signature"]))
  throw Error("INTERNAL_NEWS_SCORE_ENVELOPE_INVALID");
 const p=e.payload,i=e.integrity;
 if(!exact(p,fields)||p.schema!==INTERNAL_NEWS_SCORE_SCHEMA||
   p.scope!=="GEOMACRO_INTERNAL_RESEARCH_ONLY"||p.scored!==true||
   p.independent_reviewed!==false||p.commercial_rights_attested!==false||
   p.customer_eligible!==false||p.numerical_gri_authorized!==false||
   p.risk_score!==null||p.rubric!==INTERNAL_NEWS_SCORE_RUBRIC||
   !categoryNames.has(String(p.category))||!statusNames.has(String(p.source_status))||
   !/^[a-f0-9]{64}$/.test(p.input_id)||!/^[a-f0-9]{40}$/.test(p.source_sha)||
   !/^\d{1,20}$/.test(p.source_run_id))
  throw Error("INTERNAL_NEWS_SCORE_PAYLOAD_INVALID");
 const generated=Date.parse(p.generated_at),native=Date.parse(p.source_published_at),
 expiry=Date.parse(p.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(native)||!Number.isFinite(generated)||
   generated>now||native>generated||expiry<=now||
   expiry!==native+72*3_600_000||
   new Date(generated).toISOString()!==p.generated_at||
   new Date(expiry).toISOString()!==p.expires_at)
  throw Error("INTERNAL_NEWS_SCORE_CLOCK_INVALID");
 if(!Number.isInteger(p.intelligence_score)||p.intelligence_score<0||
  p.intelligence_score>100||![10,15,35].includes(p.triage_confidence_score)||
  !["HIGH","MEDIUM","LOW"].includes(p.urgency_band))
  throw Error("INTERNAL_NEWS_SCORE_VALUE_INVALID");
 if(original){
  const inputId=await automatedInputId(original);
  const expected=makeInternalNewsScorePayload(original,{
   inputId,generatedAt:p.generated_at,runId:p.source_run_id,sha:p.source_sha});
  if(canonicalJson(expected)!==canonicalJson(p))
   throw Error("INTERNAL_NEWS_SCORE_SOURCE_BINDING_INVALID");
 }
 if(i.signature_scheme!=="ed25519"||i.canonicalization!=="geomacro-canonical-json-v1"||
  typeof i.signing_key_id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(i.signing_key_id)||
  !/^[a-f0-9]{64}$/.test(i.payload_sha256)||!/^[A-Za-z0-9+/]{86}==$/.test(i.signature)||
  !Object.prototype.hasOwnProperty.call(keys,i.signing_key_id))
  throw Error("INTERNAL_NEWS_SCORE_KEY_INVALID");
 const raw=keys[i.signing_key_id],entry=typeof raw==="string"?{public_key_spki_b64:raw}:raw;
 if(!entry||![undefined,"active","retired"].includes(entry.status)||
   (entry.not_before&&generated<Date.parse(entry.not_before))||
   (entry.not_after&&generated>Date.parse(entry.not_after)))
  throw Error("INTERNAL_NEWS_SCORE_KEY_LIFECYCLE_INVALID");
 const bytes=new TextEncoder().encode(internalNewsScoreSignable(p));
 const digest=await inputHash(internalNewsScoreSignable(p));
 if(digest!==i.payload_sha256)throw Error("INTERNAL_NEWS_SCORE_SIGNATURE_INVALID");
 const decode=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
 const pub=await crypto.subtle.importKey("spki",decode(entry.public_key_spki_b64),
  {name:"Ed25519"},false,["verify"]);
 if(!await crypto.subtle.verify("Ed25519",pub,decode(i.signature),bytes))
  throw Error("INTERNAL_NEWS_SCORE_SIGNATURE_INVALID");
}

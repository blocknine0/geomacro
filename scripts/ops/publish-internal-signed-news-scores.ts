import {createHmac,createHash,createPrivateKey,createPublicKey,sign as ed25519Sign}
 from "node:crypto";
import {automatedInputId} from "../../src/lib/automated-intelligence-input.ts";
import {internalNewsScoreSignable,makeInternalNewsScorePayload,
 verifyInternalNewsScore,type InternalNewsScoreEnvelope}
 from "../../src/lib/internal-news-scoring.ts";
import {loadRiskObjectVerificationKeysFromEnv}
 from "../../src/lib/risk-object-signing.server.ts";
import type {StatelessIntelligenceSignal} from "../../src/lib/stateless-intelligence-model.ts";

const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/signed-news-scores";
const HASH=/^[a-f0-9]{64}$/u;
const safeError=(error:unknown)=>{
 const code=error instanceof Error?error.message:"";
 return /^(?:INTERNAL_NEWS_SCORE_[A-Z0-9_]+|SCORE_[A-Z0-9_]+)$/.test(code)
  ?code:"INTERNAL_NEWS_SCORE_UNCLASSIFIED_FAILURE";
};
export function internalNewsScoreSigner(env=process.env){
 const keyId=env.RISK_OBJECT_SIGNING_KEY_ID??"",
  raw=env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64??"",
  expected=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"";
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId)||
   !raw||!expected)throw Error("INTERNAL_NEWS_SCORE_SIGNER_MISSING");
 let key;
 try{key=createPrivateKey({key:Buffer.from(raw,"base64"),format:"der",type:"pkcs8"});}
 catch{throw Error("INTERNAL_NEWS_SCORE_SIGNER_INVALID")}
 if(key.asymmetricKeyType!=="ed25519"||
  !createPublicKey(key).export({format:"der",type:"spki"}).equals(Buffer.from(expected,"base64")))
  throw Error("INTERNAL_NEWS_SCORE_SIGNER_INVALID");
 return {keyId,key};
}
export async function publishInternalSignedNewsScores({
 signals,now=new Date(),env=process.env,fetchImpl=fetch,
 keys=loadRiskObjectVerificationKeysFromEnv()
}:{
 signals:StatelessIntelligenceSignal[],now?:Date,env?:NodeJS.ProcessEnv,
 fetchImpl?:typeof fetch,keys?:ReturnType<typeof loadRiskObjectVerificationKeysFromEnv>
}){
 if(!Array.isArray(signals)||signals.length>600||
  !/^[0-9]{1,20}$/.test(env.GITHUB_RUN_ID??"")||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??"")||
  (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim().length<32)
  throw Error("INTERNAL_NEWS_SCORE_PROTECTED_CONFIG_REQUIRED");
 const {keyId,key}=internalNewsScoreSigner(env);
 const registered=keys[keyId];
 if(!registered||(typeof registered==="string"?false:registered.status==="revoked"))
  throw Error("INTERNAL_NEWS_SCORE_REGISTERED_KEY_REQUIRED");
 const root=(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 const authorization="Bearer "+createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 async function request(url:string,body?:unknown):Promise<any>{
  const response=await fetchImpl(url,{method:body?"PUT":"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:authorization,Accept:"application/json",
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(response.redirected||response.status!==200)throw Error("INTERNAL_NEWS_SCORE_HTTP_UNAVAILABLE");
  const raw=await response.text();
  if(raw.length>300000)throw Error("INTERNAL_NEWS_SCORE_RESPONSE_OVERSIZE");
  let doc:any;try{doc=JSON.parse(raw)}catch{throw Error("INTERNAL_NEWS_SCORE_JSON_INVALID")}
  if(doc.ok!==true)throw Error("INTERNAL_NEWS_SCORE_ACK_INVALID");
  return doc;
 }
 const unique=new Map<string,StatelessIntelligenceSignal>();
 for(const signal of signals){
  const id=await automatedInputId(signal);
  if(unique.has(id))continue;
  unique.set(id,signal);
 }
 const ids=[...unique.keys()];
 const before=await request(ENDPOINT+"?view=ids");
 if(before.schema!=="geomacro.internal-signed-news-score-feed.v1"||
  !Array.isArray(before.ids)||before.ids.length>600||
  before.ids.some((id:unknown)=>typeof id!=="string"||!HASH.test(id)))
  throw Error("INTERNAL_NEWS_SCORE_INDEX_INVALID");
 const known=new Set<string>(before.ids);
 const pending=[...unique].filter(([id])=>!known.has(id));
 let created=0;
 // Even an empty batch reconciles the complete signer-source journal,
 // prevents historic revisions from occupying retained capacity and ages out.
 if(!pending.length){
  const ack=await request(ENDPOINT,{schema:"geomacro.internal-signed-news-score-batch.v1",
   retained_ids:ids,items:[]});
  if(ack.schema!=="geomacro.internal-signed-news-score-ack.v1"||
   !Array.isArray(ack.accepted_ids)||ack.accepted_ids.length)
   throw Error("INTERNAL_NEWS_SCORE_ACK_INVALID");
 }
 for(let start=0;start<pending.length;start+=40){
  const items:InternalNewsScoreEnvelope[]=[];
  for(const [inputId,signal] of pending.slice(start,start+40)){
   const payload=makeInternalNewsScorePayload(signal,{
    inputId,generatedAt:now.toISOString(),
    runId:env.GITHUB_RUN_ID!,sha:env.GITHUB_SHA!});
   const signable=internalNewsScoreSignable(payload);
   const envelope:InternalNewsScoreEnvelope={
    payload,integrity:{signing_key_id:keyId,signature_scheme:"ed25519",
     canonicalization:"geomacro-canonical-json-v1",
     payload_sha256:createHash("sha256").update(signable).digest("hex"),
     signature:ed25519Sign(null,Buffer.from(signable),key).toString("base64")}
   };
   await verifyInternalNewsScore(envelope,keys,now.getTime(),signal);
   items.push(envelope);
  }
  const ack=await request(ENDPOINT,{schema:"geomacro.internal-signed-news-score-batch.v1",
   retained_ids:ids,items});
  if(ack.schema!=="geomacro.internal-signed-news-score-ack.v1"||
   !Array.isArray(ack.accepted_ids)||
   JSON.stringify([...ack.accepted_ids].sort())!==
    JSON.stringify(items.map(e=>e.payload.input_id).sort())||
   ack.retained_sources_matched!==true)
   throw Error("INTERNAL_NEWS_SCORE_ACK_INVALID");
  created+=items.length;
 }
 const final=await request(ENDPOINT+"?view=ids");
 if(final.schema!=="geomacro.internal-signed-news-score-feed.v1"||
  !Array.isArray(final.ids)||final.ids.length!==ids.length||
  !ids.every(id=>final.ids.includes(id)))
  throw Error("INTERNAL_NEWS_SCORE_PERSISTENCE_INCOMPLETE");
 return {schema:"geomacro.internal-signed-news-score-publisher.v1",
  source_retained:signals.length,unique_source_inputs:ids.length,
  scores_total_persisted:final.ids.length,new_scores_signed:created,
  existing_scores_reused:ids.length-pending.length,
  category_counts:Object.fromEntries(["geopolitics","macro","rare_earth"].map(c=>
   [c,[...unique.values()].filter(s=>s.category===c).length])),
  score_kind:"INTERNAL_RESEARCH_TRIAGE",all_retained_inputs_signed_scored:true,
  numerical_gri_signed:false,independent_reviewed:false,customer_eligible:false,
  source_details_logged:false,b2_requests:0,supabase_requests:0,payments:0};
}
export {safeError as safeInternalNewsScoreError};

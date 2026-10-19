import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {canonicalJson} from "../../src/lib/canonical-json";
import {buildAgentQueryPlan} from "../../src/lib/agent-query-plan";
import {checkAgentQueryDeliverability} from "../../src/lib/agent-query-deliverability.server";
import {assembleAgentQueryResponse} from "../../src/lib/agent-query-response.server";
import {loadQualifiedTreasuryFx} from "../../src/lib/qualified-treasury-fx.server";
import {STRUCTURAL_CANDIDATE_VERSION,STRUCTURAL_CANDIDATE_SCOPE,structuralCandidateHash,
 assertStructuralCandidate} from "../../workers/commerce-ledger/src/structural-candidate.mjs";
// No source/customer bytes in logs or Actions artifacts. No durable writes or funds.
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
async function main(){
 const args=process.argv.slice(2),freeze=args.length===1&&args[0]==="--freeze-private";
 if(args.length&&!freeze)throw Error("TREASURY_DIGEST_UNSUPPORTED_ARGUMENTS");
 const release=await loadQualifiedTreasuryFx();
 if(!release)throw Error("TREASURY_ACTUAL_SOURCE_OR_TERMS_UNAVAILABLE");
 const plan=buildAgentQueryPlan({fulfillment_mode:"published_only",delivery_tier:"structural_baseline",
  topics:["fx_external_risk"],subjects:[{type:"country",country_iso3:"IND"}],detail:"compact"});
 const available=await checkAgentQueryDeliverability(plan);
 if(!available.deliverable)throw Error("TREASURY_CANONICAL_ENGINE_UNAVAILABLE");
 const answer=await assembleAgentQueryResponse({plan,requestId:"structural:"+plan.query_plan_hash,priceUsdc:"0.02"});
 const bytes=canonicalJson(answer);
 if(/treasury|fiscaldata|source_url|source_id|exchange_rate|rights_metadata_sha256/iu.test(bytes)||
    answer.signed_risk_objects.length||answer.gri_context!==null||answer.execution_authorized!==false)
  throw Error("TREASURY_CUSTOMER_BOUNDARY_REJECTED");
 const candidate={schema:STRUCTURAL_CANDIDATE_VERSION,capability:"structural_country_digest",
  variant:"standard",amount_atomic:"20000",country_iso3:"IND",topic:"fx_external_risk",
  request_hash:plan.query_plan_hash,answer_sha256:sha(bytes),source_file_sha256:release.sourceHash,
  rights_metadata_sha256:release.rightsHash,source_period_end:release.observedAt,checked_at:release.checkedAt,
  expires_at:new Date(Math.min(Date.parse(release.checkedAt)+86400_000,
   Date.parse(release.observedAt)+125*86400_000)).toISOString(),binding_hash:""};
 candidate.binding_hash=await structuralCandidateHash(candidate);
 await assertStructuralCandidate(candidate,bytes,STRUCTURAL_CANDIDATE_SCOPE);
 let vaultVerified=false;
 if(freeze){
  const origin=(process.env.GEOMACRO_COMMERCE_LEDGER_URL??"").trim().replace(/\/$/u,"");
  const token=(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
  const u=new URL(origin);
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||u.pathname!=="/"||
     !u.hostname.startsWith("geomacro-commerce-ledger.")||!u.hostname.endsWith(".workers.dev")||token.length<32)
   throw Error("TREASURY_PRIVATE_VAULT_CONFIG_INVALID");
  let healthy=false;
  for(let i=0;i<6;i++){
   const response=await fetch(origin+"/health",{redirect:"error",signal:AbortSignal.timeout(10_000)});
   const h=await response.json();
   healthy=response.ok&&h.storage==="durable_objects_sqlite"&&h.structural_candidate_contract_version===STRUCTURAL_CANDIDATE_VERSION&&h.structural_quarterly_candidate_available===true;
   if(healthy)break;if(i<5)await new Promise(r=>setTimeout(r,2000));
  }
  if(!healthy)throw Error("TREASURY_PRIVATE_VAULT_PROFILE_UNDEPLOYED");
  async function post(action:string,fields:Record<string,unknown>){
   const response=await fetch(origin+"/v1/delivery/"+action,{method:"POST",redirect:"error",
    headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({...STRUCTURAL_CANDIDATE_SCOPE,...fields}),signal:AbortSignal.timeout(10_000)});
   return {status:response.status,body:await response.json()};
  }
  const stored=await post("structural-candidate-freeze",{candidate,customerBytes:bytes});
  if(stored.status!==200||stored.body?.ok!==true||!["FROZEN","EXACT_REPLAY"].includes(stored.body.disposition)||stored.body.binding_hash!==candidate.binding_hash)
   throw Error("TREASURY_PRIVATE_FREEZE_FAILED");
  for(let i=0;i<2;i++){
   const r=await post("structural-candidate-readback",{bindingHash:candidate.binding_hash});
   if(r.status!==200||r.body?.ok!==true||r.body.customerBytes!==bytes||sha(r.body.customerBytes)!==candidate.answer_sha256||
      canonicalJson(r.body.candidate)!==canonicalJson(candidate)||r.body.payment_authorized!==false||r.body.settlement_attempted!==false)
    throw Error("TREASURY_PRIVATE_READBACK_FAILED");
  }
  const replay=await post("structural-candidate-freeze",{candidate,customerBytes:bytes});
  if(replay.status!==200||replay.body?.disposition!=="EXACT_REPLAY")throw Error("TREASURY_PRIVATE_REPLAY_FAILED");
  const corrupt=await post("structural-candidate-freeze",{candidate,customerBytes:bytes+" "});
  if(corrupt.status!==409||corrupt.body?.ok===true)throw Error("TREASURY_PRIVATE_MUTATION_ACCEPTED");
  vaultVerified=true;
 }
 await mkdir("artifacts",{recursive:true});
 const receipt={schema:"geomacro.treasury-structural-digest-preparation.v1",country_iso3:"IND",
  capability:"structural_country_digest",price_usdc:"0.02",canonical_engine_deliverable:true,
  native_reference_period_end:release.observedAt,current_news_or_live_quote:false,
  prepared_customer_bytes_sha256:sha(bytes),customer_bytes_length:Buffer.byteLength(bytes),
  terms_exact_bytes_verified:true,payable_offer_issued:false,private_vault_verified:vaultVerified,
  private_vault_admission_validated:true,vault_binding_hash:vaultVerified?candidate.binding_hash:null,
  vault_expires_at:vaultVerified?candidate.expires_at:null,
  settlement_verified:false,signed_deep_health_recovered:false,supabase_requests:0,payments:0};
 await writeFile("artifacts/treasury-structural-digest-receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(/^TREASURY_[A-Z_]+$/.test(e.message)?e.message:"TREASURY_PREPARATION_FAILED_CLOSED");process.exitCode=2});

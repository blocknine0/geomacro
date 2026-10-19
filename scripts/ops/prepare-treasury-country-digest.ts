import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {canonicalJson} from "../../src/lib/canonical-json";
import {buildAgentQueryPlan} from "../../src/lib/agent-query-plan";
import {checkAgentQueryDeliverability} from "../../src/lib/agent-query-deliverability.server";
import {assembleAgentQueryResponse} from "../../src/lib/agent-query-response.server";
import {loadQualifiedTreasuryFx} from "../../src/lib/qualified-treasury-fx.server";
// No source/customer bytes in logs or Actions artifacts. No durable writes or funds.
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
async function main(){
 if(process.argv.slice(2).length)throw Error("TREASURY_DIGEST_UNSUPPORTED_ARGUMENTS");
 const release=await loadQualifiedTreasuryFx({noCache:true});
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
 await mkdir("artifacts",{recursive:true});
 const receipt={schema:"geomacro.treasury-structural-digest-preparation.v1",country_iso3:"IND",
  capability:"structural_country_digest",price_usdc:"0.02",canonical_engine_deliverable:true,
  native_reference_period_end:release.observedAt,current_news_or_live_quote:false,
  prepared_customer_bytes_sha256:sha(bytes),customer_bytes_length:Buffer.byteLength(bytes),
  terms_exact_bytes_verified:true,payable_offer_issued:false,private_vault_verified:false,
  settlement_verified:false,signed_deep_health_recovered:false,supabase_requests:0,payments:0};
 await writeFile("artifacts/treasury-structural-digest-receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(/^TREASURY_[A-Z_]+$/.test(e.message)?e.message:"TREASURY_PREPARATION_FAILED_CLOSED");process.exitCode=2});

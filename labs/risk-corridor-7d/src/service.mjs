import {canonical,sha256,signEnvelope} from "./crypto.mjs";
import {GateError,normalizeRequest,lockQuote} from "./contract.mjs";
const DECISIONS = ["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"];
const rank = {CONTINUE:0,REDUCE_LIMIT:1,REQUIRE_APPROVAL:2,PAUSE:3};
const idRe = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/;
function errorResult(error, now) {
  return {ok:false,error:error instanceof GateError?error.code:"RISK_GATE_UNAVAILABLE",
    advisory_decision:"PAUSE",execution_authorized:false,chargeable:false,
    checked_at:now.toISOString(),status:error instanceof GateError?error.httpStatus:503};
}
function validatedEvidence(gro, subject, trust, now, domains) {
  if (!gro || trust?.valid!==true || trust.cryptographic_verified!==true ||
      trust.commercial_eligible!==true || !Array.isArray(trust.verified_domains) ||
      !domains.every(d=>trust.verified_domains.includes(d))) throw new GateError("CURRENT_VERIFIED_COMMERCIAL_GRO_UNAVAILABLE",422);
  if (gro.schema_version!=="gro-1.1"||gro.subject?.type!==subject.type||gro.subject?.id!==subject.id||
      gro.verification?.status!=="VERIFIED"||gro.commercial_eligibility?.status!=="VERIFIED"||
      !Number.isFinite(gro.risk?.score)||gro.risk.score<0||gro.risk.score>100||
      !Number.isFinite(gro.confidence)||gro.confidence<0||gro.confidence>1 ||
      !gro.integrity?.payload_hash||!/^[a-f0-9]{64}$/.test(gro.integrity.payload_hash))
    throw new GateError("GRO_CONTRACT_INVALID",422);
  const generated=Date.parse(gro.generated_at),expires=Date.parse(gro.expires_at);
  if (!Number.isFinite(generated)||!Number.isFinite(expires)||generated>now.getTime()||
      expires<=now.getTime()||expires<=generated) throw new GateError("GRO_STALE_OR_EXPIRED",422);
  if (subject.type==="corridor") {
    const [origin,destination]=subject.id.split(">");
    if (gro.corridor_context?.origin_country_iso3!==origin || gro.corridor_context?.destination_country_iso3!==destination)
      throw new GateError("CORRIDOR_ENDPOINT_MISMATCH",422);
  }
}
function resultSummary(result, subject, gro) {
  if (!result || result.execution_authorized!==false || result.request_id===undefined ||
      !DECISIONS.includes(result.decision) || result.subject?.id!==subject.id ||
      result.subject?.type!==subject.type || result.risk?.object_id!==gro.object_id)
    throw new GateError("CANONICAL_ENGINE_RESULT_INVALID",503);
  return {subject,gro_object_id:gro.object_id,gro_payload_sha256:gro.integrity.payload_hash,
    gro_methodology_version:gro.methodology_version,decision:result.decision,
    recommended_action:result.recommended_action,confidence:result.risk.confidence,
    risk_score:result.risk.score,reason_codes:result.reason_codes,top_drivers:result.top_drivers,
    counterfactual:result.counterfactual};
}
/**
 * The owner-supplied adapters are trust boundaries:
 * - authenticate is tenant-scoped and server-only;
 * - loadTrustedGro fetches canonical D1/B2 objects, NEVER unverified Supabase rows;
 * - verifyGro performs GeoMacro's actual pinned Ed25519 verification and domain qualification;
 * - evaluate calls the EXISTING src/lib/risk-gate-engine.ts. No new scoring algorithm.
 * - ledger persists immutable request/response and delivery in durable D1, not 7-day Supabase.
 *
 * Workflow returns PAUSE/no-charge on unknown evidence. It does not collect payments.
 */
export async function executeGate(raw, adapters, now=new Date()) {
  let input,tenant,quote,requestHash;
  try {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new GateError("CLOCK_INVALID",503);
    input=normalizeRequest(raw);
    tenant=await adapters.authenticate();
    if (!tenant?.id||!idRe.test(tenant.id)||!tenant.pricing_profile||tenant.status!=="ACTIVE")
      throw new GateError("UNAUTHORIZED",401);
    if (typeof adapters.loadTrustedGro!=="function"||typeof adapters.verifyGro!=="function"||
        typeof adapters.evaluate!=="function"||typeof adapters.signer!=="function"||
        !adapters.ledger?.claim||!adapters.ledger?.complete)
      throw new GateError("SERVER_NOT_CONFIGURED",503);
    // Lock immutable trusted schedule before any intelligence is fetched.
    quote=lockQuote(input,tenant,adapters.approvedPricing);
    requestHash=await sha256({tenant_id:tenant.id,request:input});
    const inspected=[];
    for (const subject of input.subjects) {
      const gro=await adapters.loadTrustedGro(subject,now.toISOString());
      const trust=await adapters.verifyGro(gro,subject,now);
      validatedEvidence(gro,subject,trust,now,input.domains);
      inspected.push({subject,gro});
    }
    // Scenario/history requirements must have independently verified context; no fictitious complex analysis.
    let complexContext=null;
    if (input.scenarios.length || input.historical_comparison) {
      if (typeof adapters.resolveComplexContext!=="function") throw new GateError("COMPLEX_CONTEXT_UNAVAILABLE",422);
      const ctx=await adapters.resolveComplexContext(input, inspected, now);
      if (ctx?.verified!==true || !/^[a-f0-9]{64}$/.test(ctx.context_sha256||""))
        throw new GateError("COMPLEX_CONTEXT_UNVERIFIED",422);
      complexContext={context_sha256:ctx.context_sha256,scenario_ids:input.scenarios,
        historical_comparison:input.historical_comparison};
    }
    // Verified-only preflight does not burn a commercial quota or a request ID.
    const claim=await adapters.ledger.claim({tenant_id:tenant.id,request_id:input.request_id,request_hash:requestHash,
      tier:input.tier,quote,created_at:now.toISOString()});
    if (claim.state==="CONFLICT") throw new GateError("IDEMPOTENCY_CONFLICT",409);
    if (claim.state==="REPLAY") return {...claim.response,idempotent_replay:true};
    if (claim.state!=="CLAIMED") throw new GateError("REQUEST_IN_PROGRESS",409);
    try {
      const assessments=[];
      for (const {subject,gro} of inspected) {
        const result=await adapters.evaluate({request_id:input.request_id,subject,policy_id:input.policy_id,
          action_context:input.action_context},gro,now);
        assessments.push(resultSummary(result,subject,gro));
      }
      const mostRestrictive=assessments.reduce((a,b)=>rank[b.decision]>rank[a.decision]?b:a);
      const verdictId="gmrv_"+(await sha256({tenant:tenant.id,request_id:input.request_id,request_hash:requestHash})).slice(0,40);
      const body={schema:"geomacro.risk-verdict.v1",verdict_id:verdictId,request_id:input.request_id,
        tenant_id:tenant.id,requested_tier:input.tier,pricing:quote,
        evaluated_at:now.toISOString(),expires_at:new Date(now.getTime()+5*60_000).toISOString(),
        request_hash:requestHash,requested_domains:input.domains,subjects:assessments,analysis_context:complexContext,
        decision:mostRestrictive.decision,
        aggregation_method:"MOST_RESTRICTIVE_CANONICAL_DECISION_NO_SYNTHETIC_SCORE",
        // A PAUSE from valid risk can be an earned advisory; verification failure never is.
        chargeable:quote.status==="LOCKED",payment_collected:false,
        delivery_state:"DELIVERED_UNCOLLECTED",execution_authorized:false};
      const signed=await signEnvelope(body,await adapters.signer(tenant));
      const response={ok:true,verdict:signed,execution_authorized:false};
      const finished=await adapters.ledger.complete({
        tenant_id:tenant.id,request_id:input.request_id,request_hash:requestHash,
        response,verdict_id:verdictId,claim_token:claim.claim_token,amount_atomic:quote.price_atomic,delivered_at:now.toISOString()});
      if (!finished) throw new GateError("DELIVERY_LEDGER_UNAVAILABLE",503);
      return response;
    } catch (e) {
      if (adapters.ledger.fail) await adapters.ledger.fail({tenant_id:tenant.id,request_id:input.request_id,request_hash:requestHash,claim_token:claim.claim_token}).catch(()=>{});
      throw e;
    }
  } catch(error) {
    return errorResult(error,now);
  }
}

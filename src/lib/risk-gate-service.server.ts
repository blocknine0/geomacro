import {createPrivateKey,createPublicKey,sign as edSign,verify as edVerify,createHash} from "node:crypto";
import {
  verifyRiskObjectSignature,
  canonicalRiskObjectJson,
} from "./risk-object-signing.server";

/**
 * Geomacro Risk Gate service boundary.
 *
 * Responsibilities:
 * - validate the externally supplied Risk Gate request
 * - load the latest compatible persisted GRO
 * - evaluate customer policy against that GRO
 * - return machine-readable decision context
 *
 * Product boundary:
 * - this service provides external-world risk context
 * - customer / agent policy determines the decision
 * - this service never authorizes or submits execution
 */

import {
  resolveCountryGroAtOrBefore,
} from "./country-gro-resolver.server";

import {
  evaluateRiskGate,
} from "./risk-gate-engine";

import type {
  RiskGatePolicy,
  RiskGateRequest,
  RiskGateResponse,
  RiskGateTierActivationMatrix,
  ProgressiveRiskGateTier,
} from "./risk-gate-contract";

import type {
  RiskObjectDeliveryProfile,
} from "./public-demo-risk-profile";


export type CountryRiskGateServiceInput = {
  request_id: string;

  country_iso3: string;

  action_context?: {
    action_type?: string;
    amount?: number;
    currency?: string;
    destination?: string;

    metadata?: Record<
      string,
      unknown
    >;
  };

  policy: RiskGatePolicy;

  /**
   * Trusted server-only fact aggregation; this must never come from a client
   * request body. Direct D1 Worker calls aggregate their own canonical facts.
   */
  progressive_facts?: {
    distinct_events:number;
    corroboration_sources_count:number;
    corroborated_events:number;
    standard_ready:boolean;
    latest_event_clock:string|null;
  };

  /**
   * Evaluation clock.
   *
   * Defaults to current time.
   * Can be frozen for deterministic internal testing.
   * External live-preflight callers are separately restricted
   * to a small server-clock skew window by the API boundary.
   */
  evaluated_at?: string;

  /**
   * Server-controlled Risk Object profile. Public callers do not select this.
   */
  risk_object_profile?: RiskObjectDeliveryProfile;
};


export type CountryRiskGateServiceResult = {
  request: RiskGateRequest;

  response: RiskGateResponse;

  context: {
    country_iso3: string;

    risk_object_id: string;

    methodology_version: string;

    evaluated_at: string;

    execution_authorized: false;
    tier: ProgressiveRiskGateTier;
    tier_activation_matrix: RiskGateTierActivationMatrix;
  };
  decision_signature_scheme:"Ed25519";
  decision_signature_key_id:string;
  decision_signature_b64:string;
  decision_payload_sha256:string;
  decision_signed_payload:Record<string,unknown>;
};


function normalizeCountryIso3(
  value: string,
) {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}


function requireNonEmptyString(
  value: string,
  field: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required`,
    );
  }

  return normalized;
}


function normalizeEvaluationTime(
  value?: string,
) {
  const evaluatedAt =
    value
      ? new Date(value)
      : new Date();

  if (
    Number.isNaN(
      evaluatedAt.getTime(),
    )
  ) {
    throw new Error(
      "Invalid evaluated_at timestamp",
    );
  }

  return evaluatedAt;
}


function signServerRiskGateDecision(payload:Record<string,unknown>) {
  const keyId=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_KEY_ID??"");
  const secret=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64??"");
  const pub=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
  if(!/^[A-Za-z0-9._:-]{4,120}$/.test(keyId)||secret.length<40||pub.length<40)
    throw Error("RISK_GATE_DECISION_SIGNER_UNAVAILABLE");
  const privateKey=createPrivateKey({key:Buffer.from(secret,"base64"),format:"der",type:"pkcs8"});
  const publicKey=createPublicKey({key:Buffer.from(pub,"base64"),format:"der",type:"spki"});
  if(privateKey.asymmetricKeyType!=="ed25519"||publicKey.asymmetricKeyType!=="ed25519")
    throw Error("RISK_GATE_DECISION_SIGNER_INVALID");
  const canonical=canonicalRiskObjectJson(payload);
  const bytes=Buffer.from(canonical,"utf8");
  const signature=edSign(null,bytes,privateKey);
  if(!edVerify(null,bytes,publicKey,signature))
    throw Error("RISK_GATE_DECISION_PUBLIC_KEY_MISMATCH");
  return {
    decision_signature_scheme:"Ed25519" as const,
    decision_signature_key_id:keyId,
    decision_signature_b64:signature.toString("base64"),
    decision_payload_sha256:createHash("sha256").update(bytes).digest("hex"),
    decision_signed_payload:payload,
  };
}

function provisionalServiceResult(
  input:CountryRiskGateServiceInput,
  request:RiskGateRequest,
  country:string,
  at:Date,
):{response:RiskGateResponse; tier:ProgressiveRiskGateTier;
   matrix:RiskGateTierActivationMatrix}{
  const facts=input.progressive_facts;
  const count=Math.max(0,Math.trunc(facts?.distinct_events??0));
  const sources=Math.max(0,Math.trunc(facts?.corroboration_sources_count??0));
  const standard=Boolean(facts?.standard_ready && sources>=2);
  const hasEvidence=count>0;
  const proxy=hasEvidence?Math.min(100,Math.round(100*(1-Math.exp(-0.2*count)))):100;
  const decision=hasEvidence?"REQUIRE_APPROVAL" as const:"PAUSE" as const;
  const action=hasEvidence?"REQUIRE_HUMAN_APPROVAL" as const:"BLOCK" as const;
  const matrix:RiskGateTierActivationMatrix={
    basic:{active:true,status:"ACTIVE"},
    standard:{active:standard,status:standard?"ACTIVE":"PENDING",
      corroboration_sources_count:sources,
      ...(!standard?{missing:["TWO_DISTINCT_PUBLISHERS_SAME_EVENT_WITHIN_72H"]}:{})},
    complex:{active:false,status:"LOCKED",signed_gro_ready:false,
      seven_day_rollup_ready:false,
      missing:["CURRENT_VERIFIED_SIGNED_GRO","VERIFIED_SEVEN_DAY_ROLLUP"]},
  };
  const timestamp=at.toISOString();
  const response:RiskGateResponse={
    schema_version:"risk-gate-1.0",request_id:request.request_id,
    decision,recommended_action:action,
    reason_codes:[hasEvidence?"discovery_only_provisional":"no_current_evidence"],
    counterfactual:{version:"risk-gate-counterfactual-v1.0.0",
      current_action:action,
      next_less_restrictive_action:hasEvidence?"REDUCE_EXPOSURE":"REQUIRE_HUMAN_APPROVAL",
      blockers:[{type:"verification",
        reason_code:"verified_signed_gro_required_for_executable_policy",
        current_value:"DISCOVERY_ONLY",required_value:"VERIFIED",delta_required:null}],
      note:"Counterfactual context only; it never authorizes execution."},
    subject:{type:"country",id:country},
    risk:{object_id:"derived-observation:"+country+":"+timestamp,
      score:proxy,label:hasEvidence?"WATCH":"CRITICAL",
      previous_score:null,delta:null,confidence:0,
      verification_status:"INCOMPLETE",commercial_eligibility_status:"UNVERIFIED",
      generated_at:timestamp,expires_at:new Date(at.getTime()+10800000).toISOString(),
      methodology_version:"discovery-activity-proxy-v1"},
    top_drivers:[],
    policy:{policy_id:request.policy.policy_id,policy_version:request.policy.policy_version},
    primary_driver:"INSUFFICIENT_VERIFIED_CAUSAL_EVIDENCE",
    affected_domain:"geopolitics",severity_score:proxy,
    suggested_mitigation:{exposure_cap_ratio:0,settlement_delay_hours:24},
    intraday_override:false,flash_check_available:false,
    tier_activation_matrix:matrix,
    risk_metric_semantics:hasEvidence?"OBSERVATION_DENSITY_PROXY":"NO_DATA_POLICY_SENTINEL",
    observation_count:count,corroboration_sources_count:sources,
    execution_authorized:false,
  };
  return {response,tier:standard?"STANDARD_0_15":"BASIC_0_10",matrix};
}

/**
 * Evaluate the latest persisted country GRO
 * against a caller-supplied policy.
 *
 * Supabase is authoritative while healthy. Canonical requests may continue
 * from the separately verified private-B2 continuity copy when the primary
 * read path is unavailable. Public-demo/profile boundaries never fall back
 * across profiles. No execution capability exists here.
 */
export async function
evaluateCountryRiskGate(
  input: CountryRiskGateServiceInput,
): Promise<
  CountryRiskGateServiceResult
> {
  const requestId =
    requireNonEmptyString(
      input.request_id,
      "request_id",
    );

  const countryIso3 =
    normalizeCountryIso3(
      input.country_iso3,
    );

  const evaluatedAt =
    normalizeEvaluationTime(
      input.evaluated_at,
    );

  const riskObject =
    await resolveCountryGroAtOrBefore(
      countryIso3,
      evaluatedAt.toISOString(),
      input.risk_object_profile ??
        "CANONICAL",
    );

  const groValid=Boolean(riskObject &&
    verifyRiskObjectSignature(riskObject).valid &&
    riskObject.subject.type==="country" &&
    riskObject.subject.id===countryIso3 &&
    Date.parse(riskObject.expires_at)>evaluatedAt.getTime());

  const request: RiskGateRequest = {
    request_id:
      requestId,

    subject: {
      type: "country",
      id: countryIso3,
    },

    action_context:
      input.action_context,

    policy:
      input.policy,
  };

  const provisional=groValid?null:provisionalServiceResult(input,request,countryIso3,evaluatedAt);
  const response:RiskGateResponse=groValid && riskObject
    ? evaluateRiskGate(request,riskObject,evaluatedAt)
    : provisional!.response;
  const tier:ProgressiveRiskGateTier=groValid?"COMPLEX_0_25":provisional!.tier;
  const matrix:RiskGateTierActivationMatrix=groValid
    ? {basic:{active:true,status:"ACTIVE"},
       standard:{active:input.progressive_facts?.standard_ready===true,
         status:input.progressive_facts?.standard_ready?"ACTIVE":"PENDING",
         corroboration_sources_count:input.progressive_facts?.corroboration_sources_count??0},
       complex:{active:true,status:"ACTIVE",signed_gro_ready:true,
         seven_day_rollup_ready:false,missing:["VERIFIED_SEVEN_DAY_ROLLUP"]}}
    : provisional!.matrix;
  response.tier_activation_matrix=matrix;

  if (
    response.execution_authorized !==
      false
  ) {
    throw new Error(
      "Risk Gate execution boundary violation",
    );
  }

  return {
    request,

    response,

    context: {
      country_iso3:
        countryIso3,

      risk_object_id:
        groValid && riskObject?riskObject.object_id:response.risk.object_id,

      methodology_version:
        groValid && riskObject?riskObject.methodology_version:response.risk.methodology_version,

      evaluated_at:
        evaluatedAt.toISOString(),

      execution_authorized:
        false,
      tier,
      tier_activation_matrix:matrix,
    },
    ...signServerRiskGateDecision({
      schema:"geomacro.progressive-risk-gate-decision.v1",
      request_id:requestId,country_iso3:countryIso3,tier,
      risk_gate:response,tier_activation_matrix:matrix,execution_authorized:false,
    }),
  };
}

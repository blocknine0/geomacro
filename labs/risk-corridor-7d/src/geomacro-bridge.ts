/**
 * Integration boundary for host-side GeoMacro server runtime (NOT a new news collector).
 * Existing pinned GRO verification and v1 risk evaluator remain canonical.
 * Host must supply its already-governed D1/B2 reader and domain-qualification resolver.
 * No direct public route and no production writes are wired in this feature branch.
 */
import {verifyRiskObjectSignature} from "../../../src/lib/risk-object-signing.server";
import {evaluateRiskGate} from "../../../src/lib/risk-gate-engine";
import type {GeomacroRiskObject} from "../../../src/lib/risk-object-contract";
import type {RiskGatePolicy,RiskGateRequest} from "../../../src/lib/risk-gate-contract";

type Subject={type:"country"|"corridor";id:string};
type QualifiedDomains = "geopolitics"|"macro_fx"|"critical_minerals";
export type HostDeps = {
  getCanonicalSignedGro:(subject:Subject,asOf:string)=>Promise<GeomacroRiskObject|null>;
  getVerifiedCommercialDomains:(gro:GeomacroRiskObject)=>Promise<QualifiedDomains[]>;
  getApprovedServerPolicy:(policyId:string)=>Promise<RiskGatePolicy>;
};
export function geoMacroCanonicalBridge(host:HostDeps) {
  return {
    loadTrustedGro:(subject:Subject,asOf:string)=>host.getCanonicalSignedGro(subject,asOf),
    async verifyGro(gro:GeomacroRiskObject|null,subject:Subject,now:Date) {
      if (!gro||gro.subject.type!==subject.type||gro.subject.id!==subject.id ||
          gro.verification.status!=="VERIFIED"||gro.commercial_eligibility.status!=="VERIFIED"||
          Date.parse(gro.generated_at)>now.getTime()||Date.parse(gro.expires_at)<=now.getTime())
        return {valid:false,cryptographic_verified:false,commercial_eligible:false,verified_domains:[]};
      const signature=verifyRiskObjectSignature(gro);
      if (!signature.valid)
        return {valid:false,cryptographic_verified:false,commercial_eligible:false,verified_domains:[]};
      const domains=await host.getVerifiedCommercialDomains(gro);
      return {valid:true,cryptographic_verified:true,commercial_eligible:true,verified_domains:domains};
    },
    async evaluate(request:{request_id:string;subject:Subject;policy_id:string;action_context:Record<string,unknown>},
      gro:GeomacroRiskObject, now:Date) {
      const policy=await host.getApprovedServerPolicy(request.policy_id);
      if (!policy || policy.policy_id!==request.policy_id) throw Error("SERVER_POLICY_UNAVAILABLE");
      return evaluateRiskGate({request_id:request.request_id,subject:request.subject,
        policy,action_context:request.action_context as RiskGateRequest["action_context"]},gro,now);
    }
  };
}

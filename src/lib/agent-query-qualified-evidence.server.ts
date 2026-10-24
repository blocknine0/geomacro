import type {AgentQueryPlan} from "./agent-query-plan";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";
import type {StructuralContext} from "./structural-context.server";
import type {loadAgentPoliticalGovernanceModule} from "./agent-query-political-governance.server";
import type {loadAgentWorldBankModule,AgentWorldBankModuleName} from "./agent-query-world-bank-modules.server";
import type {loadAgentCriticalMineralsModule} from "./agent-query-critical-minerals.server";
import type {GeomacroRiskObject} from "./risk-object-contract";

export type QualifiedSubjectEvidence={
  context:StructuralContext;
  governance?:Awaited<ReturnType<typeof loadAgentPoliticalGovernanceModule>>;
  worldBank:Partial<Record<AgentWorldBankModuleName,Awaited<ReturnType<typeof loadAgentWorldBankModule>>>>;
  minerals?:Awaited<ReturnType<typeof loadAgentCriticalMineralsModule>>;
  riskObject?:GeomacroRiskObject;
};
type Evidence={plan:string;capturedAt:number;asOf:string;subjects:QualifiedSubjectEvidence[]};
// Request-local identity only: never serialized, shared across buyers, written
// to storage, or populated from a request body/discovery response.
const qualified=new WeakMap<AgentQueryDeliverability,Evidence>();
const MAX_PREPARATION_MS=30_000;

export function retainQualifiedStructuralEvidence(
  availability:AgentQueryDeliverability,plan:AgentQueryPlan,
  subjects:QualifiedSubjectEvidence[],asOf:string,
):void {
  if(!availability.deliverable||availability.code!=="AVAILABLE")return;
  qualified.set(availability,structuredClone({
    plan:JSON.stringify(plan),capturedAt:Date.now(),asOf,subjects,
  }));
}

/** Pin the same qualified source reads through response preparation. Later
 * settlement still runs its independent current eligibility/proof checks.
 * Old/cloned/JSON-roundtripped availability cannot renew this private pin.
 */
export function readQualifiedStructuralEvidence(
  availability:AgentQueryDeliverability,plan:AgentQueryPlan,
):{asOf:string;subjects:QualifiedSubjectEvidence[]}|null {
  const evidence=qualified.get(availability);
  if(!evidence)return null; // Legacy/internal assemblers still use their readers.
  if(evidence.plan!==JSON.stringify(plan)||availability.query_plan_hash!==plan.query_plan_hash)
    throw Error("CAPABILITY_QUALIFIED_EVIDENCE_PLAN_MISMATCH");
  const age=Date.now()-evidence.capturedAt;
  if(age<0||age>=MAX_PREPARATION_MS)
    throw Error("CAPABILITY_QUALIFIED_EVIDENCE_PREPARATION_EXPIRED");
  return structuredClone({asOf:evidence.asOf,subjects:evidence.subjects});
}

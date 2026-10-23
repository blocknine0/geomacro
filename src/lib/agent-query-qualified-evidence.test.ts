import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {buildAgentQueryPlan} from "./agent-query-plan";
import type {StructuralContext,StructuralObservation} from "./structural-context.server";

const mock=vi.hoisted(()=>({context:vi.fn(),macro:vi.fn(),minerals:vi.fn(),governance:vi.fn(),freeze:vi.fn()}));
vi.mock("./structural-context.server",async original=>({
  ...await original<typeof import("./structural-context.server")>(),loadStructuralContext:(...args:unknown[])=>mock.context(...args),
}));
vi.mock("./agent-query-world-bank-modules.server",()=>({
  AGENT_WORLD_BANK_SOURCE_ID:"world_bank_indicators",loadAgentWorldBankModule:(...args:unknown[])=>mock.macro(...args),
}));
vi.mock("./agent-query-critical-minerals.server",()=>({
  AGENT_CRITICAL_MINERALS_SOURCE_ID:"usgs_mcs",loadAgentCriticalMineralsModule:(...args:unknown[])=>mock.minerals(...args),
}));
vi.mock("./agent-query-political-governance.server",()=>({
  AGENT_POLITICAL_GOVERNANCE_SOURCE_ID:"world_bank_wgi_political_stability",loadAgentPoliticalGovernanceModule:(...args:unknown[])=>mock.governance(...args),
}));
vi.mock("./capability-x402-prequote.server",()=>({freezeVerifiedCapabilityAnswer:(input:unknown)=>mock.freeze(input)}));
import {checkAgentQueryDeliverability,publicAgentQueryAvailability} from "./agent-query-deliverability.server";
import {readQualifiedStructuralEvidence} from "./agent-query-qualified-evidence.server";
import {prepareVerifiedCapabilityOffer} from "./capability-x402-offer.server";

const now="2026-10-23T12:00:00.000Z",observed="2026-10-23T11:00:00.000Z";
const subject={type:"country" as const,country_iso3:"IND"};
function plan(topic:string){return buildAgentQueryPlan({
  fulfillment_mode:"published_only",delivery_tier:"structural_baseline",subjects:[subject],topics:[topic],detail:"compact",
});}
function context(module:string):StructuralContext{return {
  status:"AVAILABLE",subject,methodology_status:"EVIDENCE_ONLY_NOT_IN_GRI_V1_2",note:"Synthetic test only",
  observations:[{observation_id:"test",source_id:"private-test",source_record_id:null,dimension:module,
    country_iso3:"IND",partner_country_iso3:null,observed_at:observed,published_at:null,metric:"test",
    value_numeric:0,value_text:null,unit:"test",event_type:null,signal_type:null,source_url:null,
    parser_version:"test",methodology_status:"test",quality_status:"VERIFIED",provenance:{},
    normalized_hash:"a".repeat(64),retrieved_at:now} satisfies StructuralObservation],
  metadata:{serving_layer:"COUNTRY_PROFILE_V1",warehouse_methodology_status:"EVIDENCE_ONLY_NOT_IN_GRO_V02",
    coverage:[],composition_method:null,route_modeling_status:null,direct_evidence_status:null},
};}
const contract={commercial_usage_status:"DERIVED_ONLY",raw_redistribution_allowed:false,attribution_required:false,licence_name:"Test only"};
const rights=async(ids:string[])=>({eligible:true,ineligible_source_ids:[],results:ids.map(source_id=>({
  ...contract,source_id,eligible:true,certification_state:"CERTIFIED",enabled_for_ingestion:true,
  enabled_for_commercial_signals:true,delivery_boundary:"DERIVED_ONLY" as const,raw_payload_allowed:false as const,reason:null,
}))});
async function prepare(p:ReturnType<typeof plan>,availability:Awaited<ReturnType<typeof checkAgentQueryDeliverability>>){
  await prepareVerifiedCapabilityOffer({plan:p,availability,clientRequestId:null,requestFingerprint:"b".repeat(64),
    rail:"coinbase_x402",network:"eip155:8453",asset:"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",recipient:"0x"+"1".repeat(40)});
  return mock.freeze.mock.calls.at(-1)![0].preparedIntelligence;
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(now));vi.clearAllMocks();
  for(const fn of [mock.context,mock.macro,mock.minerals,mock.governance])fn.mockImplementation(()=>{throw Error("SECOND_SOURCE_READ_MUST_NOT_HAPPEN");});
  mock.freeze.mockResolvedValue({test_only:true});
});
afterEach(()=>vi.useRealTimers());

describe("complete verified structural reads survive provider failure during preparation",()=>{
  it.each([
    ["conflict_geopolitics","geopolitical_security"],["macro_risk","macro_monetary"],["critical_minerals","critical_minerals"],
  ])("%s uses its exact first qualified data without a second provider read",async(topic,module)=>{
    const p=plan(topic),source=context(module);mock.context.mockResolvedValueOnce(source);
    const available=await checkAgentQueryDeliverability(p,{sourceEligibilityChecker:rights});
    expect(available.deliverable).toBe(true);
    // Simulate provider cache mutation/outage after the approved read.
    source.observations=[];
    const output=await prepare(p,available);
    expect(mock.context).toHaveBeenCalledTimes(1);
    expect(output.structural[0].intelligence[module].observations[0].value_numeric).toBe(0);
    expect(output.as_of).toBe(now);
    expect(output.payment.amount_usdc).toBe("0.02");
    expect(output.execution_authorized).toBe(false);
    expect(JSON.stringify(output)).not.toContain("private-test");
    expect(JSON.stringify(publicAgentQueryAvailability(available))).not.toContain("qualifiedStructural");
  });

  it("retains the qualified macro fallback state when its store goes offline",async()=>{
    const p=plan("macro_risk"),empty=context("macro_monetary");empty.observations=[];
    mock.context.mockResolvedValueOnce(empty);
    mock.macro.mockResolvedValueOnce({deliverable:true,code:"AVAILABLE",module:"macro_monetary",subject,
      source_id:"world_bank_indicators",source_observed_at:observed,source_normalized_hashes:["c".repeat(64)],
      source_contract:contract,state:{module:"macro_monetary",score:0,previous_score:null,delta:null,confidence:0.8,
        coverage:"COMPLETE",commercial_eligibility_status:"VERIFIED",generated_at:now,
        expires_at:"2026-10-24T12:00:00.000Z",methodology_version:"synthetic-test",drivers:[]}});
    const available=await checkAgentQueryDeliverability(p,{sourceEligibilityChecker:rights});
    expect(available.deliverable).toBe(true);
    const output=await prepare(p,available);
    expect(mock.macro).toHaveBeenCalledTimes(1);
    expect(mock.context).toHaveBeenCalledTimes(1);
    expect(output.structural[0].intelligence.macro_monetary.state.score).toBe(0);
    expect(output.structural[0].evidence_summary.available_dimensions).toContain("macro_monetary");
  });

  it("cannot reuse expired, edited, or serialized qualification as a fresh source pin",async()=>{
    const p=plan("critical_minerals");mock.context.mockResolvedValueOnce(context("critical_minerals"));
    const available=await checkAgentQueryDeliverability(p,{sourceEligibilityChecker:rights});
    const first=readQualifiedStructuralEvidence(available,p)!;first.subjects[0].context.observations=[];
    expect(readQualifiedStructuralEvidence(available,p)!.subjects[0].context.observations).toHaveLength(1);
    expect(readQualifiedStructuralEvidence(JSON.parse(JSON.stringify(available)),p)).toBeNull();
    expect(()=>readQualifiedStructuralEvidence(available,{...p,detail:"full"})).toThrow("PLAN_MISMATCH");
    vi.advanceTimersByTime(30_000);
    await expect(prepare(p,available)).rejects.toThrow("PREPARATION_EXPIRED");
    expect(mock.freeze).not.toHaveBeenCalled();
    expect(mock.context).toHaveBeenCalledTimes(1);
  });

  it("prepares a complete critical-minerals fallback without rereading its offline store",async()=>{
    const p=plan("critical_minerals"),empty=context("critical_minerals");empty.observations=[];
    mock.context.mockResolvedValueOnce(empty);
    mock.minerals.mockResolvedValueOnce({deliverable:true,code:"AVAILABLE",subject,
      source_id:"usgs_mcs",source_observed_at:observed,source_normalized_hashes:["d".repeat(64)],
      source_contract:contract,state:{methodology_version:"agent-critical-minerals-usgs-evidence-v1",
        coverage:"EVIDENCE_ONLY",latest_observation_year:2026,observation_count:1,commodity_count:1,
        commodities:["lithium"],metric_count:1,metrics:["production"],evidence_hash:"d".repeat(64)}});
    const available=await checkAgentQueryDeliverability(p,{sourceEligibilityChecker:rights});
    expect(available.deliverable).toBe(true);
    const output=await prepare(p,available);
    expect(mock.minerals).toHaveBeenCalledTimes(1);
    expect(mock.context).toHaveBeenCalledTimes(1);
    expect(output.structural[0].intelligence.critical_minerals.state.commodities).toEqual(["lithium"]);
    expect(output.structural[0].intelligence.critical_minerals.limitations.raw_numeric_source_rows_redistributed).toBe(false);
  });

  it("does not retain unavailable or rights-ineligible evidence",async()=>{
    const p=plan("critical_minerals");mock.context.mockResolvedValueOnce(context("critical_minerals"));
    const available=await checkAgentQueryDeliverability(p,{sourceEligibilityChecker:async()=>({
      eligible:false,ineligible_source_ids:["private-test"],
    })});
    expect(available.deliverable).toBe(false);
    expect(readQualifiedStructuralEvidence(available,p)).toBeNull();
    await expect(prepare(p,available)).rejects.toThrow("ELIGIBILITY_UNVERIFIED");
    expect(mock.freeze).not.toHaveBeenCalled();
  });
});

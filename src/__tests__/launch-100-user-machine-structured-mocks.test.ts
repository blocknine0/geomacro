import {describe,expect,it} from "vitest";
import {
  resolveGeomacroCapabilityPrice, publicCapabilityLaunchStatus,
  publicCapabilityNewSalesAllowed,
} from "../lib/capability-pricing-catalog";
import {geomacroPricedStructuredOutput} from "../lib/capability-structured-output-contract";
import {agentAdaptiveQuerySchema} from "../lib/agent-query-plan";
import {buildDecisionIntelligence, type DecisionIntelligenceSubject} from "../lib/decision-intelligence-output";
import {paidMarketWatchLimitFor} from "../lib/paid-market-watch";
import {assertLockedCapabilityDataBoundary} from "../lib/capability-priced-data-boundary.server";

/**
 * Exactly 100 founder launch-price user/machine scenarios. This is not
 * a live-current-news/source, signer, x402 merchant or settlement test.
 * All observations are explicitly synthetic and must never be sold.
 */
const SKUS=[
  {capability:"structural_country_digest",variant:"standard",price:"0.02",count:12},
  {capability:"structural_country_profile",variant:"standard",price:"0.03",count:11},
  {capability:"structural_corridor_digest",variant:"standard",price:"0.05",count:12},
  {capability:"structural_corridor_profile",variant:"standard",price:"0.08",count:11},
  {capability:"intelligence_query",variant:"focused",price:"0.05",count:12},
  {capability:"intelligence_query",variant:"standard",price:"0.10",count:12},
  {capability:"intelligence_query",variant:"complex_multi_source",price:"0.15",count:12},
  {capability:"signed_risk_object",variant:"existing_valid_signed",price:"0.05",count:9},
  {capability:"signed_risk_object",variant:"newly_qualified_signed",price:"0.10",count:9},
] as const;
const COUNTRIES=["USA","CAN","MEX","BRA","ARG","CHL","PER","GBR","DEU","FRA","POL","UKR",
  "TUR","IND","CHN","JPN","KOR","AUS","IDN","SGP","VNM","ARE","SAU","IRN","ZAF",
  "NGA","KEN","EGY","ZMB","COD","MAR","KAZ","MNG","BGD","NZL"] as const;
const CORRIDORS=[
  ["USA","CAN"],["MEX","USA"],["CHL","CHN"],["BRA","DEU"],["GBR","FRA"],
  ["DEU","POL"],["TUR","DEU"],["UKR","POL"],["IND","ARE"],["CHN","AUS"],
  ["JPN","KOR"],["IDN","SGP"],["VNM","CHN"],["SAU","IND"],["ZAF","ZMB"],
  ["COD","CHN"],["KAZ","CHN"],["MAR","ESP"],["BGD","IND"],["EGY","TUR"],
] as const;
const TOPICS=[
  ["conflict_geopolitics","sanctions_restrictions","trade_corridor"],
  ["macro_risk","fx_external_risk","sovereign_risk"],
  ["critical_minerals","energy_commodities","trade_corridor"],
] as const;
const DIMENSIONS=[
  ["geopolitical_security","sanctions_restrictions","trade_corridor"],
  ["macro_monetary","external_fx","sovereign_fiscal"],
  ["critical_minerals","energy_commodities","trade_corridor"],
] as const;
type Case={
  id:number;sku:typeof SKUS[number];category:number;actor:"user"|"machine";
  subject:DecisionIntelligenceSubject;topic:string;dimension:string;question:string;
};
const cases:Case[]=SKUS.flatMap(sku=>
  Array.from({length:sku.count},()=>sku)).map((sku,index)=>{
    const category=index%3, actor=index%2===0?"user":"machine";
    const wantsCorridor=sku.capability.includes("corridor")||
      (sku.capability==="intelligence_query"&&index%7===0);
    const subject:DecisionIntelligenceSubject=wantsCorridor?{
      type:"corridor",origin_country_iso3:CORRIDORS[index%CORRIDORS.length][0],
      destination_country_iso3:CORRIDORS[index%CORRIDORS.length][1],
    }:{type:"country",country_iso3:COUNTRIES[(index*7+Math.floor(index/9))%COUNTRIES.length]};
    const topic=TOPICS[category][Math.floor(index/3)%3];
    const dimension=DIMENSIONS[category][Math.floor(index/3)%3];
    const label=subject.type==="country"?subject.country_iso3:
      subject.origin_country_iso3+" > "+subject.destination_country_iso3;
    const question=actor==="user"
      ?"What could "+topic.replaceAll("_"," ")+" mean for "+label+", and what should I watch next?"
      :"Return canonical source-private JSON for "+label+" and "+topic+" under my exact SKU.";
    return {id:index+1,sku,category,actor,subject,topic,dimension,question};
  });
const mockObservedAt="2026-10-28T21:30:00.000Z";

describe("100 global three-category, nine-price, human-and-machine MOCK contracts",()=>{
  it("constructs exactly 100 diverse and price-locked request scenarios",()=>{
    expect(cases).toHaveLength(100);
    expect(cases.filter(c=>c.actor==="user")).toHaveLength(50);
    expect(cases.filter(c=>c.actor==="machine")).toHaveLength(50);
    expect([0,1,2].map(n=>cases.filter(c=>c.category===n).length)).toEqual([34,33,33]);
    expect(SKUS.reduce((sum,sku)=>sum+sku.count,0)).toBe(100);
    expect(SKUS.reduce((n,sku)=>n+Number(sku.price)*sku.count,0)).toBeCloseTo(7);
    expect(publicCapabilityLaunchStatus("gri_read")).toBe("RETIRED");
    expect(publicCapabilityLaunchStatus("risk_gate_bundle")).toBe("COMING_SOON");
    expect(publicCapabilityNewSalesAllowed("risk_gate_bundle")).toBe(false);
  });

  for(const testCase of cases){
    it(`#${String(testCase.id).padStart(3,"0")} ${testCase.actor} category=${testCase.category} ${testCase.sku.capability}/${testCase.sku.variant}`,()=>{
      const {sku,subject,dimension,topic,question}=testCase;
      const price=resolveGeomacroCapabilityPrice(sku.capability,sku.variant);
      expect(price.amount_usdc).toBe(sku.price);
      expect(price.amount_atomic).toBe(String(Math.round(Number(sku.price)*1_000_000)));
      expect(price.output_contract).toBe("GEOMACRO_DERIVED_STRUCTURED_ONLY");
      const scope=geomacroPricedStructuredOutput(sku.capability,sku.variant);
      expect(scope.customer_delivery_status).toBe("CONTRACT_ONLY_REQUIRES_LIVE_PROOF");
      expect(scope.charge_authorized_by_catalog).toBe(false);
      expect(scope.source_publisher_urls).toBe(false);
      expect(scope.raw_source_payload).toBe(false);
      expect(scope.execution_authorized).toBe(false);
      const product=sku.capability==="signed_risk_object"&&sku.variant==="newly_qualified_signed"?
        {capability:sku.capability,variant:sku.variant,issued_after:"2026-10-28T21:28:00.000Z"}:
        {capability:sku.capability,variant:sku.variant};
      const parsed=agentAdaptiveQuerySchema.safeParse({
        schema_version:"geomacro.agent-query.v1",
        question,product,subjects:[subject],topics:[topic],
        intent:subject.type==="corridor"?"corridor":"single_subject",
        fulfillment_mode:"published_only",
        delivery_tier:sku.capability.startsWith("structural_")?
          "structural_baseline":"signed_risk_intelligence",
        detail:"standard",client_request_id:"GM-MOCK100-"+String(testCase.id).padStart(3,"0"),
      });
      expect(parsed.success).toBe(true);
      // Runtime builder sees only a synthetic structural label; NO real risk,
      // no live event, no signed object and no payment are ever invented.
      const dimensions=[dimension,...(sku.capability.includes("profile")?
        ["trade_corridor"]:[])];
      const decision=buildDecisionIntelligence({
        subject,state_version:"MOCK_NOT_LIVE_"+testCase.id,
        risk:null,confidence:null,observed_at:mockObservedAt,
        attribution:[],structural:{available_dimensions:dimensions,
          latest_observed_at:mockObservedAt},
        live:null,risk_gate_decision:null,product:{
          capability:sku.capability,variant:sku.variant,
        },as_of:mockObservedAt,
      });
      expect(decision.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(decision.decision.action).toBe("INSUFFICIENT_EVIDENCE");
      expect(decision.raw_data_delivered).toBe(false);
      expect(decision.execution_authorized).toBe(false);
      expect(decision.market_watch.items.length).toBeLessThanOrEqual(
        paidMarketWatchLimitFor(sku.capability,sku.variant));
      expect(decision.market_watch.items.every(item=>
        item.current_market_price===null && item.estimated_price_change_pct===null &&
        item.predicted_direction==="NOT_ESTABLISHED" && item.scenario_only===true)).toBe(true);
      expect(decision.market_watch.limitations.private_inputs_exposed).toBe(false);
      expect(decision.market_watch.limitations.execution_authorized).toBe(false);
      const intelligence=sku.capability.includes("profile")?
        {[dimension]:{observations:[{test_fixture_only:true}]},
          trade_corridor:{observations:[{test_fixture_only:true}]}}:
        {[dimension]:{observations:[{test_fixture_only:true}]}};
      const payload={
        execution_authorized:false,risk_gate:[],
        decision_intelligence:[{market_watch:decision.market_watch}],
        current_state:[{risk:null}],
        structural:[{subject,intelligence}],
        signed_risk_objects:[],gri_context:null,
      };
      expect(()=>assertLockedCapabilityDataBoundary(payload,sku.capability,sku.variant))
        .not.toThrow();
      expect(()=>assertLockedCapabilityDataBoundary({...payload,risk_gate:[{result:{}}]},
        sku.capability,sku.variant)).toThrow("CAPABILITY_PRICE_RISK_GATE_UPSELL_FORBIDDEN");
      const tooMany=Array.from({length:paidMarketWatchLimitFor(sku.capability,sku.variant)+1},
        (_,n)=>({watch_id:"MOCK_"+n}));
      expect(()=>assertLockedCapabilityDataBoundary({...payload,
        decision_intelligence:[{market_watch:{items:tooMany}}]},
        sku.capability,sku.variant)).toThrow("CAPABILITY_PRICE_MARKET_WATCH_TIER_EXCEEDED");
      if(sku.capability.startsWith("structural_")){
        expect(()=>assertLockedCapabilityDataBoundary({...payload,
          signed_risk_objects:[{mock_signature_only:true}]},
          sku.capability,sku.variant)).toThrow("CAPABILITY_PRICE_SIGNED_UPSELL_FORBIDDEN");
        expect(()=>assertLockedCapabilityDataBoundary({...payload,
          current_state:[{risk:{score:50}}]},
          sku.capability,sku.variant)).toThrow("CAPABILITY_PRICE_STRUCTURAL_RISK_UPSELL_FORBIDDEN");
      }
      if(sku.capability==="signed_risk_object"){
        expect(scope.extra_preconditions.some(text=>text.includes("SIGNED_GRO"))).toBe(true);
        expect(payload.signed_risk_objects).toEqual([]);
      }
    });
  }
});

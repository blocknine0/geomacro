import {describe,it,expect} from "vitest";
import {assertPricedStructuredDelivery} from "./capability-structured-delivery.server";

// Synthetic contract fixtures; these do not confer evidence/signing eligibility.
const subject={type:"country",country_iso3:"IND"};
const date="2026-10-23T00:00:00.000Z";
function fixture(){return {
  execution_authorized:false,as_of:date,methodology:{version:"test"},
  limitations:{missing_is_never_zero_risk:true},delivered_product_hash:"a".repeat(64),
  query_plan_hash:"b".repeat(64),question_interpretation:{topics:["macro_risk"]},
  answer:{status:"SUPPORTED",headline:"Synthetic test",what_changed:[],why_it_matters:"Test"},
  analysis:{type:"single_subject"},
  gri_context:{scope:"global",snapshot_id:"test",as_of:date,score:0,previous_score:0,
    coverage:0,change_attribution:[],methodology_version:"test",verification_status:"VERIFIED",proof_hash:"c".repeat(64)},
  structural:[{subject,intelligence:{macro_monetary:{state:{value:0}}},
    evidence_summary:{available_dimensions:["macro_monetary"],latest_observed_at:date},
    serving:{composition_method:"DIRECT"}}],
  current_state:[{subject,state_version:"test",live:{checked_at:date},structural:{status:"AVAILABLE"}}],
  signed_risk_objects:[{subject,object:{risk_object_id:"test",schema_version:"test",
    risk:{score:0},confidence:0,attribution:[],verification:{status:"VERIFIED"},
    methodology_version:"test",generated_at:date,expires_at:date,integrity:{hash:"d".repeat(64)}}}],
  risk_gate:[{subject,result:{execution_authorized:false},
    tiered_product:{
      indicative_risk_score_0_100:10,
      corroborated_risk_score_0_100:25.25,
      proprietary_institutional_score_0_100:72,
      signal_alerts:[{category:"GEOPOLITICS",observed_at:date}],
      confidence:{level:"LOW",verification:"PROVISIONAL"},
      category_fact_sheets:[{category:"GEOPOLITICS",verified_category_score_0_100:35}],
      source_references:[{event_reference:"case-1",content_sha256:["d".repeat(64)]}],
      gro_signature:{signature:"sign",payload_sha256:"d".repeat(64)},
      seven_day_corridor_friction_history:{points:[{day_utc:"2026-10-23"}]},
      seven_day_verified_subject_history:{points:[{day_utc:"2026-10-23",snapshot_sha256:"d".repeat(64)}]},
      raw_evidence_chain:{gro_object_id:"proof"},
      b2_archive:{b2_archive_link:"b2://geomacro-private-archive/evidence.json"},
    },
  }],
};}

describe("actual per-price structured delivery completeness",()=>{
  const products=[
    ["gri_read","verified_cached"],["gri_read","verified_change_attribution"],
    ["structural_country_digest","standard"],["structural_corridor_digest","standard"],
    ["structural_country_profile","standard"],["structural_corridor_profile","standard"],
    ["intelligence_query","focused"],["intelligence_query","standard"],
    ["intelligence_query","complex_multi_source"],
    ["signed_risk_object","existing_valid_signed"],["signed_risk_object","newly_qualified_signed"],
    ["risk_gate_bundle","existing_proof_preflight"],["risk_gate_bundle","standard"],
    ["risk_gate_bundle","complex_multi_source"],
  ];
  it.each(products)("checks %s/%s without inventing conditional data",(capability,variant)=>{
    expect(()=>assertPricedStructuredDelivery(fixture(),capability,variant)).not.toThrow();
    expect(()=>assertPricedStructuredDelivery({execution_authorized:false},capability,variant))
      .toThrow("CAPABILITY_STRUCTURED_DELIVERY_REQUIRED_FIELD_MISSING");
  });
  it("rejects missing data in any subject and empty subject arrays",()=>{
    const payload=fixture();
    payload.structural[0].evidence_summary.available_dimensions=[];
    expect(()=>assertPricedStructuredDelivery(payload,"structural_country_digest","standard"))
      .toThrow("available_dimensions");
    payload.structural[0].evidence_summary.available_dimensions=["macro_monetary"];
    payload.structural.push({...payload.structural[0],evidence_summary:{
      ...payload.structural[0].evidence_summary,latest_observed_at:" "}});
    expect(()=>assertPricedStructuredDelivery(payload,"structural_country_digest","standard"))
      .toThrow("latest_observed_at");
    payload.structural=[];
    expect(()=>assertPricedStructuredDelivery(payload,"structural_country_digest","standard"))
      .toThrow("structural[*].subject");
  });
  it("rejects absent/invalid GRI values while retaining real zero and no-change states",()=>{
    for(const score of [null,undefined,NaN,Infinity,""]){
      const payload=fixture();Object.assign(payload.gri_context,{score});
      expect(()=>assertPricedStructuredDelivery(payload,"gri_read","verified_cached"))
        .toThrow("gri_context.score");
    }
    const cached=fixture();delete (cached.gri_context as Partial<typeof cached.gri_context>).previous_score;
    expect(()=>assertPricedStructuredDelivery(cached,"gri_read","verified_cached")).not.toThrow();
    expect(()=>assertPricedStructuredDelivery(cached,"gri_read","verified_change_attribution"))
      .toThrow("gri_context.previous_score");
  });
  it("rejects missing tier deliverables and permits Basic without a signed GRO",()=>{
    const payload=fixture();payload.signed_risk_objects=[];
    expect(()=>assertPricedStructuredDelivery(payload,"structural_country_digest","standard")).not.toThrow();
    expect(()=>assertPricedStructuredDelivery(payload,"risk_gate_bundle","existing_proof_preflight")).not.toThrow();
    const noScore=fixture();delete (noScore.risk_gate[0].tiered_product as
      Partial<typeof noScore.risk_gate[0]["tiered_product"]>).corroborated_risk_score_0_100;
    expect(()=>assertPricedStructuredDelivery(noScore,"risk_gate_bundle","standard"))
      .toThrow("corroborated_risk_score_0_100");
    const noArchive=fixture();delete (noArchive.risk_gate[0].tiered_product.b2_archive as
      Partial<typeof noArchive.risk_gate[0]["tiered_product"]["b2_archive"]>).b2_archive_link;
    expect(()=>assertPricedStructuredDelivery(noArchive,"risk_gate_bundle","complex_multi_source"))
      .toThrow("b2_archive_link");
    expect(()=>assertPricedStructuredDelivery({...fixture(),execution_authorized:true},"intelligence_query","focused"))
      .toThrow("BOUNDARY_INVALID");
    expect(()=>assertPricedStructuredDelivery(fixture(),"intelligence_query","premium")).toThrow();
  });
});

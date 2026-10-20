import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {
  assessGeomacroEvidenceDelivery,GEOMACRO_THREE_DOMAIN_DELIVERY_VERSION,
  GEOMACRO_THREE_DOMAIN_OUTPUTS,geomacroThreeDomainDeliveryContract,
  type GeomacroEvidenceState,
} from "../lib/three-domain-delivery-contract";
import {GEOMACRO_CAPABILITY_PRICES} from "../lib/capability-pricing-catalog";
const base:GeomacroEvidenceState={
  domain:"geopolitics",evidence_kind:"native_official_development",
  native_period_verified:true,country_or_corridor_match_verified:true,
  topic_or_indicator_match_verified:true,current_release_qualified:true,
  independent_corroboration_verified:true,
  independent_corroboration_required:true,
  intended_commercial_rights_verified:true,
  signed_current_product_verified:true,
};
describe("final three-domain source-to-customer contract",()=>{
 it("publishes exactly the three canonical domains, without claiming every country/corridor is current",()=>{
   const c=geomacroThreeDomainDeliveryContract();
   expect(c.schema).toBe(GEOMACRO_THREE_DOMAIN_DELIVERY_VERSION);
   expect(Object.keys(c.categories).sort()).toEqual(["geopolitics","macro","rare_earth"]);
   expect(c.country_routing_registry_count).toBe(195);
   expect(c.named_corridor_reference_registry_count).toBe(58);
   expect(c.all_195_country_domain_cells_verified).toBe(false);
   expect(c.all_58_corridors_currently_verified).toBe(false);
   expect(c.source_activation_implied).toBe(false);
   expect(c.quoted_price_or_customer_payment_authorized).toBe(false);
   expect(c.source_urls_and_original_article_bytes_delivered).toBe(false);
   expect(c.shared_event_identity).toContain("ONE_QUALIFIED_EVENT");
 });
 it("describes distinct source clocks and user/machine fields without adding prices",()=>{
   const g=GEOMACRO_THREE_DOMAIN_OUTPUTS;
   expect(g.geopolitics.machine_receives).toContain("independent_corrob_count");
   expect(g.macro.machine_receives).toContain("observation_period");
   expect(g.macro.machine_receives).toContain("rate_reference_not_spot");
   expect(g.rare_earth.machine_receives).toContain("mineral_id");
   expect(g.rare_earth.plain_language_limitation).toMatch(/monthly copper statistic/);
   expect(Object.keys(GEOMACRO_CAPABILITY_PRICES)).toHaveLength(8);
   expect(Object.values(GEOMACRO_CAPABILITY_PRICES)
     .reduce((sum,x)=>sum+Object.keys(x).length,0)).toBe(14);
 });
 it("never upgrades a registered or clock-only source to an eligible current event",()=>{
   const missing=[
     {native_period_verified:false},
     {country_or_corridor_match_verified:false},
     {topic_or_indicator_match_verified:false},
     {current_release_qualified:false},
     {independent_corroboration_verified:false},
   ];
   for(const change of missing){
     const r=assessGeomacroEvidenceDelivery({...base,...change});
     expect(r.current_event_verified).toBe(false);
     expect(r.commercial_derived_delivery_eligible).toBe(false);
     expect(r.current_signed_index_eligible).toBe(false);
     expect(r.charge_authorized).toBe(false);
   }
   for(const kind of ["annual_statistical_reference","daily_reference_quote",
     "mineral_production_reference","corridor_traffic_reference"] as const){
     const domain=kind==="mineral_production_reference"?"rare_earth":
       kind==="daily_reference_quote"||kind==="annual_statistical_reference"?"macro":"geopolitics";
     const r=assessGeomacroEvidenceDelivery({...base,domain,evidence_kind:kind});
     expect(r.evidence_state).toBe("PERIODIC_REFERENCE_ONLY");
     expect(r.current_event_verified).toBe(false);
     expect(r.commercial_derived_delivery_eligible).toBe(false);
   }
   expect(assessGeomacroEvidenceDelivery({...base,
     evidence_kind:"discovery_signal"}).evidence_state).toBe("DISCOVERY_LEAD_ONLY");
   expect(assessGeomacroEvidenceDelivery({...base,
     evidence_kind:"mineral_production_reference"}).evidence_state)
     .toBe("UNSUPPORTED_DOMAIN_EVIDENCE");
 });
 it("permits one qualifying official original for an unscored Find, never for signed GRI",()=>{
   const one=assessGeomacroEvidenceDelivery({...base,
     independent_corroboration_required:false,
     independent_corroboration_verified:false,
     signed_current_product_verified:true});
   expect(one.current_event_verified).toBe(true);
   expect(one.commercial_derived_delivery_eligible).toBe(true);
   expect(one.independently_corroborated).toBe(false);
   expect(one.current_signed_index_eligible).toBe(false);
   expect(one.charge_authorized).toBe(false);
 });
 it("separates qualified research, authorized derived output, signed-score proof and payment",()=>{
   const noRights=assessGeomacroEvidenceDelivery({...base,
     intended_commercial_rights_verified:false});
   expect(noRights.current_event_verified).toBe(true);
   expect(noRights.commercial_derived_delivery_eligible).toBe(false);
   const notSigned=assessGeomacroEvidenceDelivery({...base,
     signed_current_product_verified:false});
   expect(notSigned.commercial_derived_delivery_eligible).toBe(true);
   expect(notSigned.current_signed_index_eligible).toBe(false);
   const verified=assessGeomacroEvidenceDelivery(base);
   expect(verified.current_signed_index_eligible).toBe(true);
   expect(verified.charge_authorized).toBe(false);
   expect(verified.provider_payload_redistribution_allowed).toBe(false);
 });
 it("reuses the one canonical discovery route and NEVER changes payment POST",()=>{
   const route=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
   const caps=readFileSync("src/routes/api.intelligence.capabilities.ts","utf8");
   expect(route).toContain('url.searchParams.get("view")==="delivery-contract"');
   expect(route).toContain("geomacroThreeDomainDeliveryContract()");
   expect(route).toContain("...mainnetIntelligenceHandlers");
   expect(route).toContain('url.searchParams.get("view")!=="source-status"');
   expect(route).not.toContain("POST: async");
   expect(caps).toContain('view==="domains"');
   expect(caps).toContain("geomacroThreeDomainDeliveryContract()");
   expect(caps).toContain('view==="outputs"');
   expect(caps).toContain('view==="license"');
 });
});

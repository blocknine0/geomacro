import {readFileSync} from "node:fs";
// Operational source-discovery index, NOT a publisher/scorer and NOT a paid
// risk evidence source. This avoids a second 58-route scoring engine.
const country=JSON.parse(readFileSync(
 new URL("../../config/operator-country-source-crosswalk.v1.json",import.meta.url),"utf8"));
const corridors=JSON.parse(readFileSync(
 new URL("../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
const categories=new Set(["geopolitics","macro_fx","critical_minerals"]);
function requireCategory(domain){
 if(!categories.has(domain))throw Error("COUNTRY_CORRIDOR_DOMAIN_INVALID");
 return domain;
}
function normalizeIso3(value){
 const code=String(value??"").trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(code))throw Error("COUNTRY_ISO3_REQUIRED");
 return code;
}
export function candidateCountrySourceCrosswalk(countryIso3,domain){
 const iso3=normalizeIso3(countryIso3),cat=requireCategory(domain);
 const global=country.global_country_dim.filter(x=>x.domains.includes(cat));
 const national=country.national_primary.filter(x=>x.domains.includes(cat)&&
  x.country_iso3.includes(iso3));
 return {country_iso3:iso3,domain:cat,
  global_source_candidates:global.map(x=>({
   source_id:x.id,existing_family:x.canonical_family_id||null,
   review_status:x.source_activation_state,
   country_mapping_certified:false,
  })),
  national_source_candidates:national.map(x=>({
   source_id:x.id,existing_family:x.canonical_family_id||null,
   review_status:x.source_activation_state,
   country_mapping_certified:false,
  })),
  commercial_verified_coverage:false,verified_recent_country_evidence:false,
 };
}
export function namedCorridorCandidateReference(id){
 const route=corridors.corridors.find(x=>x.id===String(id??""));
 if(!route)return null;
 return {id:route.id,name:route.name,
  country_iso3:route.country_iso3.slice(),category_tags:route.category_tags.slice(),
  criticality_analyst_unverified:route.criticality_analyst_unverified,
  monitor_source_ids:route.monitor_refs.map(x=>x.source_id),
  route_model_status:"NOT_MODELED",
  risk_score:null,flow_index:null,
  verified_current_disruption:false,
  signed_commercial_delivery_allowed:false};
}
export function candidateCorridorsForCountry(countryIso3,domain){
 const iso3=normalizeIso3(countryIso3),cat=requireCategory(domain);
 return corridors.corridors.filter(x=>
  x.country_iso3.includes(iso3)&&x.category_tags.includes(cat))
  .map(x=>namedCorridorCandidateReference(x.id));
}
export const COUNTRY_CORRIDOR_CROSSWALK_STATUS=Object.freeze({
 global_sources:country.global_country_dim.length,
 national_sources:country.national_primary.length,
 corridor_sources:corridors.source_registry.length,
 named_corridors:corridors.corridors.length,
 signed_risk_delivery_active:false,
});

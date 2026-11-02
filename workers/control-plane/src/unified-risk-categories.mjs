/** Source discovery keywords are observation filters, not event verification. */
export const CATEGORY_SPECS=Object.freeze({
 GEOPOLITICS:Object.freeze({raw_category:"geopolitics",
  keywords:["conflict","sanctions","military","missile","trade war","blockade","naval"],
  authoritative_domains:["defense.gov","mod.uk","ukmto.org","un.org"],
  gro_drivers:["conflict","sanctions","political_instability","trade_policy"]}),
 MACRO_FX:Object.freeze({raw_category:"macro",
  keywords:["inflation","devaluation","central bank","rate hike","sovereign debt","default"],
  authoritative_domains:["imf.org","worldbank.org","federalreserve.gov","bis.org"],
  gro_drivers:["monetary_policy","inflation","labor_market","currency_fx","macro_stress"]}),
 CRITICAL_MINERALS:Object.freeze({raw_category:"rare_earth",
  keywords:["lithium","cobalt","nickel","rare earth","mining ban","export quota","smelter"],
  authoritative_domains:["usgs.gov","bgs.ac.uk"],
  gro_drivers:["rare_earth_supply","critical_minerals"]})
});
export const CATEGORIES=Object.freeze(Object.keys(CATEGORY_SPECS));
export const WEIGHTS=Object.freeze({GEOPOLITICS:0.40,MACRO_FX:0.35,CRITICAL_MINERALS:0.25});
export const CATEGORY_STATUS=Object.freeze({
 VERIFIED:"VERIFIED_SIGNED_GRO",
 OBSERVED:"OBSERVED_UNVERIFIED",
 EMPTY:"NO_VERIFIED_SIGNAL"
});
/** Do not count the broad shipping_logistics driver in minerals or macro by assumption. */
export function validatedSignedCategoryScores(gro){
 if(!gro||!Array.isArray(gro.attribution)||gro.verification?.status!=="VERIFIED"||
   gro.commercial_eligibility?.status!=="VERIFIED")return {};
 const out={};
 for(const [category,spec] of Object.entries(CATEGORY_SPECS)){
  const drivers=gro.attribution.filter(a=>spec.gro_drivers.includes(a?.driver));
  if(!drivers.length||drivers.some(d=>!Number.isFinite(d.score_contribution)||
    d.score_contribution<0||d.score_contribution>100))continue;
  out[category]=Math.min(1,Math.max(0,drivers.reduce((n,d)=>n+d.score_contribution,0)/100));
 }
 return out;
}

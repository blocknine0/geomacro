// Source-only geographic partition of canonical UN193 + PSE/VAT.
// 6 inhabited continent groups, ONE country per 2h per group.
// Transcontinental assignments are FIXED and documented; no country overlaps.
// Discovery and 3 category verification reuse the canonical source engine,
// never assume original, commercial rights, signing or 195 actual events.
export const CONTINENT_COUNTRIES_195=Object.freeze({
 africa:Object.freeze(("AGO BDI BEN BFA BWA CAF CIV CMR COD COG COM CPV DJI DZA EGY ERI ETH GAB GHA GIN GMB GNB GNQ KEN LBR LBY LSO MAR MDG MLI MOZ MRT MUS MWI NAM NER NGA RWA SDN SEN SLE SOM SSD STP SWZ SYC TCD TGO TUN TZA UGA ZAF ZMB ZWE").split(" ")),
 asia:Object.freeze(("AFG ARE ARM AZE BGD BHR BRN BTN CHN GEO IDN IND IRN IRQ ISR JOR JPN KAZ KGZ KHM KOR KWT LAO LBN LKA MDV MMR MNG MYS NPL OMN PAK PHL PRK PSE QAT SAU SGP SYR THA TJK TKM TLS TUR UZB VNM YEM").split(" ")),
 europe:Object.freeze(("ALB AND AUT BEL BGR BIH BLR CHE CYP CZE DEU DNK ESP EST FIN FRA GBR GRC HRV HUN IRL ISL ITA LIE LTU LUX LVA MCO MDA MKD MLT MNE NLD NOR POL PRT ROU RUS SMR SRB SVK SVN SWE UKR VAT").split(" ")),
 north_america:Object.freeze(("ATG BHS BLZ BRB CAN CRI CUB DMA DOM GRD GTM HND HTI JAM KNA LCA MEX NIC PAN SLV TTO USA VCT").split(" ")),
 south_america:Object.freeze(("ARG BOL BRA CHL COL ECU GUY PER PRY SUR URY VEN").split(" ")),
 oceania:Object.freeze(("AUS FJI FSM KIR MHL NRU NZL PLW PNG SLB TON TUV VUT WSM").split(" ")),
});
export const CONTINENTS_195=Object.freeze(Object.keys(CONTINENT_COUNTRIES_195));
export const SWEEP_EPOCH_MS=Date.parse("2026-10-22T00:00:00.000Z");
export const SWEEP_SLOT_MS=2*60*60*1000;
const fail=(code)=>{throw Error("CONTINENT_COUNTRY_195_"+code);};
export function assertContinentCanonical195(registryText){
 if(typeof registryText!=="string")fail("CANONICAL_REGISTRY_REQUIRED");
 const matched=/const COUNTRY_ROWS=`([\s\S]*?)`/u.exec(registryText);
 if(!matched)fail("CANONICAL_REGISTRY_REQUIRED");
 const registry=matched[1].trim().split(/\r?\n/u).map(r=>r.split("|")[0]);
 const all=Object.values(CONTINENT_COUNTRIES_195).flat();
 if(registry.length!==195||new Set(registry).size!==195||
   all.length!==195||new Set(all).size!==195||
   all.some(x=>!/^[A-Z]{3}$/u.test(x)||!registry.includes(x))||
   registry.some(x=>!all.includes(x))||
   !CONTINENT_COUNTRIES_195.asia.includes("PSE")||
   !CONTINENT_COUNTRIES_195.europe.includes("VAT"))
   fail("REGISTRY_PARTITION_MISMATCH");
 return true;
}
export function planTwoHourContinentCountrySweep({
 continent,registryText,eventName="schedule",now=new Date(),
 requestedIso3=""
}={}){
 if(!CONTINENTS_195.includes(continent))fail("CONTINENT_UNRECOGNIZED");
 assertContinentCanonical195(registryText);
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   now.getTime()<SWEEP_EPOCH_MS)fail("UTC_SLOT_CLOCK_INVALID");
 if(!["schedule","workflow_dispatch"].includes(eventName))
   fail("PROTECTED_EVENT_ONLY");
 const members=CONTINENT_COUNTRIES_195[continent];
 const registered=registryText.match(/const COUNTRY_ROWS=`([\s\S]*?)`/u)[1]
   .trim().split(/\r?\n/u).map(r=>r.split("|")[0]);
 let position,trigger;
 if(eventName==="workflow_dispatch"&&requestedIso3!==""){
  if(!/^[A-Z]{3}$/u.test(requestedIso3)||!members.includes(requestedIso3))
    fail("MANUAL_ISO3_NOT_IN_THIS_CONTINENT");
  position=members.indexOf(requestedIso3);trigger="MANUAL_PINNED_ISO3";
 }else{
  if(requestedIso3!=="")fail("SCHEDULE_CANNOT_OVERRIDE_COUNTRY");
  const slot=Math.floor((now.getTime()-SWEEP_EPOCH_MS)/SWEEP_SLOT_MS);
  position=slot%members.length;
  trigger=eventName==="schedule"?"TWO_HOUR_UTC_ROTATION":"MANUAL_CURRENT_SLOT";
 }
 const iso3=members[position],globalStart=registered.indexOf(iso3);
 if(globalStart<0)fail("COUNTRY_GLOBAL_INDEX_MISSING");
 return Object.freeze({
  continent,country_iso3:iso3,batch_start:globalStart,batch_count:1,
  continent_country_index:position,continent_country_count:members.length,
  global_country_baseline:195,all_categories:3,
  sweep_slots:members.length,sweep_duration_hours:members.length*2,
  two_hour_cadence:true,trigger,
  original_checks_per_country_cap:4,discovery_requests_per_country_cap:12,
  actual_country_original_verified:false,source_rights_verified:false,
  reviewed_signatures_present:false,hot_signed_publication_verified:false,
  provider_quota_global_headroom_unverified:true,
  payment_authorized:false
 });
}
